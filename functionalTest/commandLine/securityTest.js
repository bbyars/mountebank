'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../mb').create(port + 1),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout;

describe('mb without --allowInjection', function () {
    this.timeout(timeout);

    promiseIt('should return a 400 if response injection is used', function () {
        const fn = request => ({ body: `${request.method} INJECTED` }),
            stub = { responses: [{ inject: fn.toString() }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if predicate injection is used', function () {
        const fn = () => true,
            stub = {
                predicates: [{ inject: fn.toString() }],
                responses: [{ is: { body: 'Hello, World! ' } }]
            },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if endOfResponseResolver is used', function () {
        const stub = { responses: [{ is: { data: 'success' } }] },
            resolver = () => true,
            request = {
                protocol: 'tcp',
                port,
                stubs: [stub],
                mode: 'text',
                endOfRequestResolver: { inject: resolver.toString() }
            };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if a decorate behavior is used', function () {
        const fn = response => response,
            stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { decorate: fn.toString() } }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if a wait behavior function is used', function () {
        const fn = () => 1000,
            stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: fn.toString() } }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should allow a wait behavior that directly specifies latency', function () {
        const stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: 100 } }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 201);
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if a shellTransform behavior is used', function () {
        const stub = { responses: [{ is: {}, _behaviors: { shellTransform: 'command' } }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });

    promiseIt('should return a 400 if a proxy addDecorateBehavior is used', function () {
        const proxy = {
                to: 'http://google.com',
                addDecorateBehavior: '(request, response) => { response.body = ""; }'
            },
            stub = { responses: [{ proxy: proxy }] },
            request = { protocol: 'http', port, stubs: [stub] };

        return mb.start().then(() => mb.post('/imposters', request)).then(response => {
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        }).finally(() => mb.stop());
    });
});
