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
        it('should resolve "is" without transformation', function () {
            var resolver = StubResolver.create({}, combinators.identity),
                logger = { debug: mock() },
                stub = { is: 'value' };

            return resolver.resolve(stub, {}, logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should post process the result', function () {
            var postProcess = function (response) { return response.toUpperCase();},
                resolver = StubResolver.create({}, postProcess),
                logger = { debug: mock() },
                stub = { is: 'value' };

            return resolver.resolve(stub, {}, logger, []).then(function (response) {
                assert.strictEqual(response, 'VALUE');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxy: { to: 'where' } };

            return resolver.resolve(stub, 'request', logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.ok(proxy.to.wasCalledWith('where', 'request'));
            });
        });

        promiseIt('should resolve "proxyOnce" by saving the proxy results', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxyOnce: { to: 'where' } };

            return resolver.resolve(stub, 'request', logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.strictEqual(stub.is, 'value');
            });
        });

        promiseIt('should resolve "proxyAll" by adding a new "is" stub to the front of the list', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxyAll: { to: 'where', remember: ['first', 'second'] } },
                request = { first: 'one', second: 'two', three: 'three' },
                stubs = [1, 2, 3];

            return resolver.resolve(stub, request, logger, stubs).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [{
                    predicates: { first: { is: 'one' }, second: { is: 'two' } },
                    responses: [{ is: 'value' }]
                }, 1, 2, 3]);
            });
        });

        promiseIt('should resolve "proxyAll" and remember full object predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxyAll: { to: 'where', remember: ['key'] } },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [1, 2, 3];

            return resolver.resolve(stub, request, logger, stubs).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [{
                    predicates: { key: {
                        nested: {
                            first: { is: 'one' },
                            second: { is: 'two' }
                        },
                        third: { is: 'three' }
                    }},
                    responses: [{ is: 'value' }]
                }, 1, 2, 3]);
            });
        });

        promiseIt('should resolve "proxyAll" and remember nested keys', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = StubResolver.create(proxy, combinators.identity),
                logger = { debug: mock() },
                stub = { proxyAll: { to: 'where', remember: ['key.nested.first'] } },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } },
                stubs = [1, 2, 3];

            return resolver.resolve(stub, request, logger, stubs).then(function (response) {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [{
                    predicates: { key: {
                        nested: {
                            first: { is: 'one' },
                        }
                    }},
                    responses: [{ is: 'value' }]
                }, 1, 2, 3]);
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
                fn = 'function (request, state, callback) {\n' +
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
