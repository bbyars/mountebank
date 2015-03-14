'use strict';

var assert = require('assert'),
    api = require('../api/api'),
    port = api.port + 1,
    Q = require('q'),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    exec = require('child_process').exec,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000),
    smtp = require('../api/smtp/smtpClient'),
    http = BaseHttpClient.create('http'),
    https = BaseHttpClient.create('https');

function mb (args) {
    var deferred = Q.defer(),
        calledDone = false,
        mbPath = path.normalize(__dirname + '/../../bin/mb'),
        command = mbPath + ' ' + args + ' --port ' + port + ' --pidfile mb-test.pid',
        process;

    if (isWindows) {
        command = 'node ' + command;
    }

    process = exec(command, { cwd: __dirname, encoding: 'utf8' });

    ['stdout', 'stderr'].forEach(function (stream) {
        process[stream].on('data', function () {
            if (!calledDone) {
                // We don't connect a TTY to stdout, so the child process mb isn't logging to the console
                // Use a sleep as a crutch to wait for any pending imposter creation logging
                setTimeout(function () {
                    calledDone = true;
                    deferred.resolve();
                }, 250);
            }
        });
    });
    return deferred.promise;
}

describe('mb command line', function () {
    this.timeout(timeout);

    // I normally separating the data needed for the assertions from the test setup,
    // but I wanted this to be a reasonably complex regression test
    promiseIt('should load multiple files with --configfile glob', function () {
        return mb("start --configfile 'imposters/*.json'").then(function () {
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
            assert.strictEqual(response.body, 'Account 123');
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
            return mb('stop');
        });
    });

    // This is the stub resolver injection example on /docs/api/injection
    promiseIt('should evaluate ejs templates when loading configuration files', function () {
        return mb('start --configfile templates/imposters.ejs --allowInjection').then(function () {
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
            return mb('stop');
        });
    });
});
