'use strict';

var assert = require('assert'),
    api = require('../api/api'),
    port = api.port + 1,
    mb = require('../mb').create(port),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    smtp = require('../api/smtp/smtpClient'),
    http = BaseHttpClient.create('http'),
    https = BaseHttpClient.create('https'),
    fs = require('fs');

describe('mb command line', function () {
    if (isWindows) {
        // slower process startup time because Windows
        this.timeout(timeout * 2);
    }
    else {
        this.timeout(timeout);
    }

    // I normally advocate separating the data needed for the assertions from the test setup,
    // but I wanted this to be a reasonably complex regression test
    promiseIt('should support complex configuration with --configfile in multiple files', function () {
        var args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];

        return mb.start(args).then(function () {
            return http.post('/orders', '', 4545);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/123');
            return http.post('/orders', '', 4545);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/234');
            return http.get('/orders/123', 4545);
        }).then(function (response) {
            assert.strictEqual(response.body, 'Order 123');
            return http.get('/orders/234', 4545);
        }).then(function (response) {
            assert.strictEqual(response.body, 'Order 234');
            return https.get('/accounts/123', 5555);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 401);
            return https.responseFor({
                method: 'GET',
                path: '/accounts/123',
                port: 5555,
                headers: { authorization: 'Basic blah===' }
            });
        }).then(function (response) {
            assert.ok(response.body.indexOf('<id>123</id>') > 0);
            return https.responseFor({
                method: 'GET',
                path: '/accounts/234',
                port: 5555,
                headers: { authorization: 'Basic blah===' }
            });
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 404);
            return smtp.send({
                from: '"From 1" <from1@mb.org>',
                to: ['"To 1" <to1@mb.org>'],
                subject: 'subject 1',
                text: 'text 1'
            }, 6565);
        }).finally(function () {
            return mb.stop();
        });
    });

    // This is the response resolver injection example on /docs/api/injection
    promiseIt('should evaluate stringify function in templates when loading configuration files', function () {
        var args = ['--configfile', path.join(__dirname, 'templates/imposters.ejs'), '--allowInjection'];

        return mb.start(args).then(function () {
            return http.get('/first', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 1 });
            return http.get('/second', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 2 });
            return http.get('/first', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 1 });
            return http.get('/counter', 4546);
        }).then(function (response) {
            assert.strictEqual(response.body, 'There have been 2 proxied calls');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should evaluate nested stringify functions when loading configuration files', function () {
        var args = ['--configfile', path.join(__dirname, 'nestedStringify/imposters.ejs'), '--allowInjection'];

        return mb.start(args).then(function () {
            return http.get('/', 4542);
        }).then(function (response) {
            assert.deepEqual(response.body, { success: true });
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should not render through ejs when --noParse option provided', function () {
        var args = ['--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];

        return mb.start(args).then(function () {
            return http.get('/', 4545);
        }).then(function (response) {
            assert.strictEqual(response.body, '<% should not render through ejs');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should allow saving replayable format', function () {
        var args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')],
            expected;

        return mb.start(args).then(function () {
            return mb.get('/imposters?replayable=true');
        }).then(function (response) {
            expected = response.body;
            return mb.save();
        }).then(function () {
            assert.ok(fs.existsSync('mb.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
            fs.unlinkSync('mb.json');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should allow saving to a different config file', function () {
        var args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')],
            expected;

        return mb.start(args).then(function () {
            return mb.get('/imposters?replayable=true');
        }).then(function (response) {
            expected = response.body;
            return mb.save(['--savefile', 'saved.json']);
        }).then(function () {
            assert.ok(fs.existsSync('saved.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('saved.json')));
            fs.unlinkSync('saved.json');
        }).finally(function () {
            return mb.stop();
        });
    });

    if (process.env.MB_AIRPLANE_MODE !== 'true') {
        promiseIt('should allow removing proxies during save', function () {
            var proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port + 1, stubs: [proxyStub], name: this.name + ' proxy' },
                expected;

            return mb.start().then(function () {
                return mb.post('/imposters', proxyRequest);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 4));
                return http.get('/', port + 1);
            }).then(function () {
                return mb.get('/imposters?replayable=true&removeProxies=true');
            }).then(function (response) {
                expected = response.body;
                return mb.save(['--removeProxies']);
            }).then(function (result) {
                assert.strictEqual(result.exitCode, 0);
                assert.ok(fs.existsSync('mb.json'));
                assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
                fs.unlinkSync('mb.json');
            }).finally(function () {
                return mb.stop();
            });
        });
    }
});
