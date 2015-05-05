'use strict';

var assert = require('assert'),
    StubResolver = require('../../src/models/stubResolver'),
    combinators = require('../../src/util/combinators'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    util = require('util');

describe('stubResolver', function () {
    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            var proxy = {},
                postProcess = combinators.identity,
                resolver = StubResolver.create(proxy, postProcess),
                logger = { debug: mock() },
                stub = { is: 'value' };

            return resolver.resolve(stub, {}, logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should post process the result', function () {
            var postProcess = function (response, request) { return response.toUpperCase() + '-' + request.value;},
                resolver = StubResolver.create({}, postProcess),
                logger = { debug: mock() },
                stub = { is: 'value' };

            return resolver.resolve(stub, { value: 'REQUEST' }, logger, []).then(function (response) {
                assert.strictEqual(response, 'VALUE-REQUEST');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxy: { to: 'where' } };

            return resolver.resolve(stub, 'request', logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.ok(proxy.to.wasCalledWith('where', 'request', { to: 'where', mode: 'proxyOnce' }), proxy.to.message());
            });
        });

        promiseIt('should default to "proxyOnce" mode', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxy: { to: 'where' } };

            return resolver.resolve(stub, 'request', logger, []).then(function () {
                assert.strictEqual(stub.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxy: { to: 'where', mode: 'unrecognized' } };

            return resolver.resolve(stub, 'request', logger, []).then(function () {
                assert.strictEqual(stub.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should resolve "proxy" in "proxyOnce" mode by adding a new "is" stub to the front of the list', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxy: { to: 'where' } },
                request = { },
                stubs = [{ responses: [] }, { responses: [stub] }];

            return resolver.resolve(stub, request, logger, stubs).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [
                    { responses: [] },
                    { responses: [{ is: 'value' }], predicates: {} },
                    { responses: [stub] }
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember full objects as "deepEquals" predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [{ responses: [stub] }];

            return resolver.resolve(stub, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ deepEquals: { key: { nested: { first: 'one', second: 'two' }, third: 'three' } } }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [stub]
                    }
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember nested keys as "equals" predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{ matches: { key: { nested: { first: true } } } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [{ responses: [stub] }];

            return resolver.resolve(stub, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ equals: { key: { nested: { first: 'one' } } } }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [stub]
                    }
                ]);
            });
        });

        promiseIt('should add predicate parameters from predicateGenerators', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true }, caseSensitive: true, except: 'xxx' }]
                    }
                },
                request = { key: 'Test' },
                stubs = [{ responses: [stub] }];

            return resolver.resolve(stub, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ deepEquals: { key: 'Test' }, caseSensitive: true, except: 'xxx' }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [stub]
                    }
                ]);
            });
        });

        promiseIt('should allow "inject" response', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = 'function (request) { return request.key  + " injected"; }',
                stub = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(stub, request, logger, []).then(function (response) {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = 'function (request) { throw Error("BOOM!!!"); }',
                stub = { inject: fn },
                errorsLogged = [];

            logger.error = function () {
                var message = util.format.apply(this, Array.prototype.slice.call(arguments));
                errorsLogged.push(message);
            };

            return resolver.resolve(stub, {}, logger, []).then(function () {
                assert.fail('should not have resolved');
            }, function (error) {
                assert.strictEqual(error.message, 'invalid response injection');
                assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
            });
        });

        promiseIt('should allow injection state across calls to resolve', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = 'function (request, state) {\n' +
                     '    state.counter = state.counter || 0;\n' +
                     '    state.counter += 1;\n' +
                     '    return state.counter;\n' +
                     '}',
                stub = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(stub, request, logger, []).then(function (response) {
                assert.strictEqual(response, 1);
                return resolver.resolve(stub, request, logger, []);
            }).then(function (response) {
                assert.strictEqual(response, 2);
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = 'function (request, state, logger, callback) {\n' +
                     '    setTimeout(function () { callback("value"); }, 1);\n' +
                    '}',
                stub = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(stub, request, logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = 'function (request) { request.key = "CHANGED"; return 0; }',
                stub = { inject: fn },
                request = { key: 'ORIGINAL' };

            return resolver.resolve(stub, request, logger, []).then(function () {
                assert.strictEqual(request.key, 'ORIGINAL');
            });
        });
    });
});
