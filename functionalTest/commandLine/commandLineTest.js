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
    https = BaseHttpClient.create('https');

describe('mb command line', function () {
    if (isWindows) {
        // slower process startup time because Windows
        this.timeout(timeout*2);
    }
    else {
        this.timeout(timeout);
    }

    // I normally separating the data needed for the assertions from the test setup,
    // but I wanted this to be a reasonably complex regression test
    promiseIt('should support complex configuration with --configfile in multiple files', function () {
        // Delay because we need to wait long enough for the imposters to be created
        return mb.start(['--configfile', path.join(__dirname, 'imposters/imposters.ejs')]).delay(500).then(function () {
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

    // This is the stub resolver injection example on /docs/api/injection
    promiseIt('should evaluate stringify function in templates when loading configuration files', function () {
        // Delay because we need to wait long enough for the imposters to be created
        return mb.start(['--configfile', path.join(__dirname, 'templates/imposters.ejs'), '--allowInjection']).delay(500).then(function () {
            return http.get('/first', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 3 });
            return http.get('/second', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 4 });
            return http.get('/first', 4546);
        }).then(function (response) {
            assert.deepEqual(response.body, { count: 3 });
            return http.get('/counter', 4546);
        }).then(function (response) {
            assert.strictEqual(response.body, 'There have been 2 proxied calls');
        }).finally(function () {
            return mb.stop();
        });
    });
});
