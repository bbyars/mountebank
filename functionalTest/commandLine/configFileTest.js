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
    https = BaseHttpClient.create('https');

describe('--configfile', function () {
    this.timeout(timeout);

    promiseIt('should support complex configuration with --configfile in multiple files', function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];

        return mb.start(args)
            .then(() => http.post('/orders', '', 4545))
            .then(response => {
                assert.strictEqual(response.statusCode, 201);
                assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/123');
                return http.post('/orders', '', 4545);
            })
            .then(response => {
                assert.strictEqual(response.statusCode, 201);
                assert.strictEqual(response.headers.location, 'http://localhost:4545/orders/234');
                return http.get('/orders/123', 4545);
            })
            .then(response => {
                assert.strictEqual(response.body, 'Order 123');
                return http.get('/orders/234', 4545);
            })
            .then(response => {
                assert.strictEqual(response.body, 'Order 234');
                return https.get('/accounts/123', 5555);
            })
            .then(response => {
                assert.strictEqual(response.statusCode, 401);
                return https.responseFor({
                    method: 'GET',
                    path: '/accounts/123',
                    port: 5555,
                    headers: { authorization: 'Basic blah===' }
                });
            })
            .then(response => {
                assert.ok(response.body.indexOf('<id>123</id>') > 0);
                return https.responseFor({
                    method: 'GET',
                    path: '/accounts/234',
                    port: 5555,
                    headers: { authorization: 'Basic blah===' }
                });
            })
            .then(response => {
                assert.strictEqual(response.statusCode, 404);
                return smtp.send({
                    from: '"From 1" <from1@mb.org>',
                    to: ['"To 1" <to1@mb.org>'],
                    subject: 'subject 1',
                    text: 'text 1'
                }, 6565);
            })
            .then(response => {
                assert.strictEqual(response.response, '250 OK: message queued');
                return https.get('/users/123', 7575);
            }).then(response => {
                assert.ok(response.body.indexOf('<users>') > -1);
                assert.ok(response.body.indexOf('<id>123</id>') > 0);
            })
            .finally(() => mb.stop());
    });

    // This is the response resolver injection example on /docs/api/injection
    promiseIt('should evaluate stringify function in templates when loading configuration files', function () {
        const args = ['--configfile', path.join(__dirname, 'templates/imposters.ejs'), '--allowInjection', '--localOnly'];

        return mb.start(args)
            .then(() => http.get('/first', 4546))
            .then(response => {
                assert.deepEqual(response.body, { count: 1 });
                return http.get('/second', 4546);
            })
            .then(response => {
                assert.deepEqual(response.body, { count: 2 });
                return http.get('/first', 4546);
            })
            .then(response => {
                assert.deepEqual(response.body, { count: 1 });
                return http.get('/counter', 4546);
            })
            .then(response => {
                assert.strictEqual(response.body, 'There have been 2 proxied calls');
            })
            .finally(() => mb.stop());
    });

    promiseIt('should evaluate nested stringify functions when loading configuration files', function () {
        const args = ['--configfile', path.join(__dirname, 'nestedStringify/imposters.ejs'), '--allowInjection', '--localOnly'];

        return mb.start(args)
            .then(() => http.get('/', 4542))
            .then(response => {
                assert.deepEqual(response.body, { success: true });
            })
            .finally(() => mb.stop());
    });

    promiseIt('should not render through ejs when --noParse option provided', function () {
        const args = ['--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];

        return mb.start(args)
            .then(() => http.get('/', 4545))
            .then(response => {
                assert.strictEqual(response.body, '<% should not render through ejs');
            })
            .finally(() => mb.stop());
    });
});
