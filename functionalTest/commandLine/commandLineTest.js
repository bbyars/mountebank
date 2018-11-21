'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    smtp = require('../api/smtp/smtpClient'),
    http = BaseHttpClient.create('http'),
    https = BaseHttpClient.create('https'),
    fs = require('fs');

describe('mb command line', () => {
    // I normally advocate separating the data needed for the assertions from the test setup,
    // but I wanted this to be a reasonably complex regression test
    promiseIt('should support complex configuration with --configfile in multiple files', () => {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];

        return mb.start(args).then(() => http.post('/orders', '', 4545)).then(response => {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/123');
            return http.post('/orders', '', 4545);
        }).then(response => {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/234');
            return http.get('/orders/123', 4545);
        }).then(response => {
            assert.strictEqual(response.body, 'Order 123');
            return http.get('/orders/234', 4545);
        }).then(response => {
            assert.strictEqual(response.body, 'Order 234');
            return https.get('/accounts/123', 5555);
        }).then(response => {
            assert.strictEqual(response.statusCode, 401);
            return https.responseFor({
                method: 'GET',
                path: '/accounts/123',
                port: 5555,
                headers: { authorization: 'Basic blah===' }
            });
        }).then(response => {
            assert.ok(response.body.indexOf('<id>123</id>') > 0);
            return https.responseFor({
                method: 'GET',
                path: '/accounts/234',
                port: 5555,
                headers: { authorization: 'Basic blah===' }
            });
        }).then(response => {
            assert.strictEqual(response.statusCode, 404);
            return smtp.send({
                from: '"From 1" <from1@mb.org>',
                to: ['"To 1" <to1@mb.org>'],
                subject: 'subject 1',
                text: 'text 1'
            }, 6565);
        }).finally(() => mb.stop());
    }).timeout(timeout);

    // This is the response resolver injection example on /docs/api/injection
    promiseIt('should evaluate stringify function in templates when loading configuration files', () => {
        const args = ['--configfile', path.join(__dirname, 'templates/imposters.ejs'), '--allowInjection'];

        return mb.start(args).then(() => http.get('/first', 4546)).then(response => {
            assert.deepEqual(response.body, { count: 1 });
            return http.get('/second', 4546);
        }).then(response => {
            assert.deepEqual(response.body, { count: 2 });
            return http.get('/first', 4546);
        }).then(response => {
            assert.deepEqual(response.body, { count: 1 });
            return http.get('/counter', 4546);
        }).then(response => {
            assert.strictEqual(response.body, 'There have been 2 proxied calls');
        }).finally(() => mb.stop());
    }).timeout(timeout);

    promiseIt('should evaluate nested stringify functions when loading configuration files', () => {
        const args = ['--configfile', path.join(__dirname, 'nestedStringify/imposters.ejs'), '--allowInjection'];

        return mb.start(args).then(() => http.get('/', 4542)).then(response => {
            assert.deepEqual(response.body, { success: true });
        }).finally(() => mb.stop());
    }).timeout(timeout);

    promiseIt('should not render through ejs when --noParse option provided', () => {
        const args = ['--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];

        return mb.start(args).then(() => http.get('/', 4545)).then(response => {
            assert.strictEqual(response.body, '<% should not render through ejs');
        }).finally(() => mb.stop());
    }).timeout(timeout);

    promiseIt('should allow saving replayable format', () => {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        let expected;

        return mb.start(args).then(() => mb.get('/imposters?replayable=true')).then(response => {
            expected = response.body;
            return mb.save();
        }).then(() => {
            assert.ok(fs.existsSync('mb.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
            fs.unlinkSync('mb.json');
        }).finally(() => mb.stop());
    }).timeout(timeout);

    promiseIt('should allow saving to a different config file', () => {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        let expected;

        return mb.start(args).then(() => mb.get('/imposters?replayable=true')).then(response => {
            expected = response.body;
            return mb.save(['--savefile', 'saved.json']);
        }).then(() => {
            assert.ok(fs.existsSync('saved.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('saved.json')));
            fs.unlinkSync('saved.json');
        }).finally(() => mb.stop());
    }).timeout(timeout);

    if (process.env.MB_AIRPLANE_MODE !== 'true') {
        promiseIt('should allow removing proxies during save', () => {
            const proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port + 1, stubs: [proxyStub], name: 'PROXY' };
            let expected;

            return mb.start().then(() => mb.post('/imposters', proxyRequest)).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 4));
                return http.get('/', port + 1);
            }).then(() => mb.get('/imposters?replayable=true&removeProxies=true')).then(response => {
                expected = response.body;
                return mb.save(['--removeProxies']);
            }).then(result => {
                assert.strictEqual(result.exitCode, 0);
                assert.ok(fs.existsSync('mb.json'));
                assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
                fs.unlinkSync('mb.json');
            }).finally(() => mb.stop());
        }).timeout(timeout);
    }
});
