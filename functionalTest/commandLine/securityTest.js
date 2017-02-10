'use strict';

var assert = require('assert'),
    api = require('../api/api'),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('mb without --allowInjection', function () {
    if (isWindows) {
        // slower process startup time because Windows
        this.timeout(timeout * 2);
    }
    else {
        this.timeout(timeout);
    }

    promiseIt('should return a 400 if response injection is used', function () {
        var fn = function (request) { return { body: request.method + ' INJECTED' }; },
            stub = { responses: [{ inject: fn.toString() }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if predicate injection is used', function () {
        var fn = function () { return true; },
            stub = {
                predicates: [{ inject: fn.toString() }],
                responses: [{ is: { body: 'Hello, World! ' } }]
            },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if endOfResponseResolver is used', function () {
        var stub = { responses: [{ is: { data: 'success' } }] },
            resolver = function () { return true; },
            request = {
                protocol: 'tcp',
                port: port,
                stubs: [stub],
                mode: 'text',
                name: this.name,
                endOfRequestResolver: { inject: resolver.toString() }
            };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if a decorate behavior is used', function () {
        var fn = function (response) { return response; },
            stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { decorate: fn.toString() } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if a wait behavior function is used', function () {
        var fn = function () { return 1000; },
            stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: fn.toString() } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should allow a wait behavior that directly specifies latency', function () {
        var stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: 100 } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if a shellTransform behavior is used', function () {
        var stub = { responses: [{ is: {}, _behaviors: { shellTransform: 'command' } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });

    promiseIt('should return a 400 if a proxy addDecorateBehavior is used', function () {
        var proxy = {
                to: 'http://google.com',
                addDecorateBehavior: 'function (request, response) { response.body = ""; }'
            },
            stub = { responses: [{ proxy: proxy }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return mb.start().then(function () {
            return mb.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(function () {
            return mb.stop();
        });
    });
});
