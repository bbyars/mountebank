'use strict';

var assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    combinators = require('../../src/util/combinators'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    util = require('util');

describe('responseResolver', function () {
    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            var proxy = {},
                postProcess = combinators.identity,
                resolver = ResponseResolver.create(proxy, postProcess),
                logger = { debug: mock() },
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, {}, logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should post process the result', function () {
            var postProcess = function (response, request) { return response.toUpperCase() + '-' + request.value; },
                resolver = ResponseResolver.create({}, postProcess),
                logger = { debug: mock() },
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, { value: 'REQUEST' }, logger, []).then(function (response) {
                assert.strictEqual(response, 'VALUE-REQUEST');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.ok(proxy.to.wasCalledWith('where', 'request', {
                    to: 'where',
                    mode: 'proxyOnce'
                }), proxy.to.message());
            });
        });

        promiseIt('should default to "proxyOnce" mode', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(function () {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = { proxy: { to: 'where', mode: 'unrecognized' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(function () {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = { proxy: { to: 'where' } },
                request = { },
                stubs = [{ responses: [] }, { responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [
                    { responses: [] },
                    { responses: [{ is: 'value' }], predicates: {} },
                    { responses: [responseConfig] }
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember full objects as "deepEquals" predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ deepEquals: { key: { nested: { first: 'one', second: 'two' }, third: 'three' } } }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember nested keys as "equals" predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{ matches: { key: { nested: { first: true } } } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ equals: { key: { nested: { first: 'one' } } } }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add predicate parameters from predicateGenerators', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true }, caseSensitive: true, except: 'xxx' }]
                    }
                },
                request = { key: 'Test' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{ deepEquals: { key: 'Test' }, caseSensitive: true, except: 'xxx' }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should allow "inject" response', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = function (request) { return request.key + ' injected'; },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function (response) {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = function () { throw Error('BOOM!!!'); },
                responseConfig = { inject: fn },
                errorsLogged = [];

            logger.error = function () {
                var message = util.format.apply(this, Array.prototype.slice.call(arguments));
                errorsLogged.push(message);
            };

            return resolver.resolve(responseConfig, {}, logger, []).then(function () {
                assert.fail('should not have resolved');
            }, function (error) {
                assert.strictEqual(error.message, 'invalid response injection');
                assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
            });
        });

        promiseIt('should allow injection state across calls to resolve', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = function (request, state) {
                    state.counter = state.counter || 0;
                    state.counter += 1;
                    return state.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function (response) {
                assert.strictEqual(response, 1);
                return resolver.resolve(responseConfig, request, logger, []);
            }).then(function (response) {
                assert.strictEqual(response, 2);
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                fn = function (request, state, logger, callback) {
                    setTimeout(function () { callback('value'); }, 1);
                },
                responseConfig = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, { debug: mock() }, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = function (request) { request.key = 'CHANGED'; return 0; },
                responseConfig = { inject: fn.toString() },
                request = { key: 'ORIGINAL' };

            return resolver.resolve(responseConfig, request, logger, []).then(function () {
                assert.strictEqual(request.key, 'ORIGINAL');
            });
        });

        promiseIt('should not run injection during dry run validation', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                fn = function () { throw Error('BOOM!!!'); },
                responseConfig = { inject: fn.toString() },
                request = { isDryRun: true };

            return resolver.resolve(responseConfig, request, logger, []).then(function (response) {
                assert.deepEqual(response, {});
            });
        });

        promiseIt('should throw error if multiple response types given', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                responseConfig = { is: 'value', proxy: { to: 'http://www.google.com' } };

            return resolver.resolve(responseConfig, {}, logger, []).then(function () {
                assert.fail('should not have resolved');
            }, function (error) {
                assert.strictEqual(error.message, 'each response object must have only one response type');
            });
        });
    });
});
