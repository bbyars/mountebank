'use strict';

var assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    combinators = require('../../src/util/combinators'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    Logger = require('../fakes/fakeLogger');

describe('responseResolver', function () {
    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            var proxy = {},
                postProcess = combinators.identity,
                resolver = ResponseResolver.create(proxy, postProcess),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, {}, logger, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should post process the result', function () {
            var postProcess = function (response, request) {
                    return response.toUpperCase() + '-' + request.value;
                },
                resolver = ResponseResolver.create({}, postProcess),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, { value: 'REQUEST' }, logger, []).then(function (response) {
                assert.strictEqual(response, 'VALUE-REQUEST');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
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
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(function () {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'unrecognized' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(function () {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } },
                request = {},
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

        promiseIt('should support adding wait behavior to newly created stub', function () {
            var proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addWaitBehavior: true } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        responses: [{ is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } }],
                        predicates: []
                    },
                    { responses: [responseConfig] }
                ]);
            });
        });

        promiseIt('should support adding wait behavior to newly created response in proxyAlways mode', function () {
            var proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                // First call adds the stub, second call adds a response
                return resolver.resolve(responseConfig, request, logger, stubs);
            }).then(function () {
                assert.deepEqual(stubs, [
                    { responses: [responseConfig] },
                    {
                        responses: [
                            { is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } },
                            { is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } }
                        ], predicates: []
                    }
                ]);
            });
        });

        promiseIt('should support adding decorate behavior to newly created stub', function () {
            var decorateFunc = 'function (request, response) {}';
            var proxy = { to: mock().returns(Q({ data: 'value' })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addDecorateBehavior: decorateFunc } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    { responses: [{ is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }], predicates: [] },
                    { responses: [responseConfig] }
                ]);
            });
        });

        promiseIt('should support adding decorate behavior to newly created response in proxyAlways mode', function () {
            var decorateFunc = 'function (request, response) {}';
            var proxy = { to: mock().returns(Q({ data: 'value' })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                // First call adds the stub, second call adds a response
                return resolver.resolve(responseConfig, request, logger, stubs);
            }).then(function () {
                assert.deepEqual(stubs, [
                    { responses: [responseConfig] },
                    { responses: [
                        { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } },
                        { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }
                    ], predicates: [] }
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember full objects as "deepEquals" predicates', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
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
                        predicates: [{
                            deepEquals: {
                                key: {
                                    nested: { first: 'one', second: 'two' },
                                    third: 'three'
                                }
                            }
                        }],
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
                logger = Logger.create(),
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
                logger = Logger.create(),
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

        promiseIt('should add xpath predicate parameter in predicateGenerators with one match', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: { xpath: { selector: '//title' } } }
                        }]
                    }
                },
                request = { field: '<books><book><title>Harry Potter</title></book></books>' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [
                            {
                                deepEquals: { field: 'Harry Potter' },
                                xpath: { selector: '//title' }
                            }
                        ],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with multiple matches', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: {
                                field: {
                                    xpath: {
                                        selector: '//isbn:title',
                                        ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                                    }
                                }
                            }
                        }]
                    }
                },
                xml = '<root xmlns:isbn="http://schemas.isbn.org/ns/1999/basic.dtd">' +
                      '  <isbn:book><isbn:title>Harry Potter</isbn:title></isbn:book>' +
                      '  <isbn:book><isbn:title>The Hobbit</isbn:title></isbn:book>' +
                      '  <isbn:book><isbn:title>Game of Thrones</isbn:title></isbn:book>' +
                      '</root>',
                request = { field: xml },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [
                            {
                                deepEquals: { field: 'Harry Potter' },
                                xpath: {
                                    selector: '//isbn:title[1]',
                                    ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                                }
                            },
                            {
                                deepEquals: { field: 'The Hobbit' },
                                xpath: {
                                    selector: '//isbn:title[2]',
                                    ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                                }
                            },
                            {
                                deepEquals: { field: 'Game of Thrones' },
                                xpath: {
                                    selector: '//isbn:title[3]',
                                    ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                                }
                            }
                        ],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with one match', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: { jsonpath: { selector: '$..title' } } }
                        }]
                    }
                },
                request = { field: { title: 'Harry Potter' } },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [
                            {
                                deepEquals: { field: 'Harry Potter' },
                                jsonpath: { selector: '$..title' }
                            }
                        ],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators', function () {
            var proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: { jsonpath: { selector: '$.books[*].title' } } }
                        }]
                    }
                },
                request = {
                    field: {
                        books: [
                            { title: 'Harry Potter' },
                            { title: 'The Hobbit' },
                            { title: 'Game of Thrones' }
                        ]
                    }
                },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(function () {
                assert.deepEqual(stubs, [
                    {
                        predicates: [
                            {
                                deepEquals: { field: 'Harry Potter' },
                                jsonpath: { selector: '$.books[0].title' }
                            },
                            {
                                deepEquals: { field: 'The Hobbit' },
                                jsonpath: { selector: '$.books[1].title' }
                            },
                            {
                                deepEquals: { field: 'Game of Thrones' },
                                jsonpath: { selector: '$.books[2].title' }
                            }
                        ],
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
                logger = Logger.create(),
                fn = function (request) {
                    return request.key + ' injected';
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function (response) {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = function () {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn };

            return resolver.resolve(responseConfig, {}, logger, []).then(function () {
                assert.fail('should not have resolved');
            }, function (error) {
                assert.strictEqual(error.message, 'invalid response injection');
                logger.error.assertLogged('injection X=> Error: BOOM!!!');
            });
        });

        promiseIt('should allow injection request state across calls to resolve', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
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


        promiseIt('should allow injection imposter state across calls to resolve', function () {
            var mockedResolver = ResponseResolver.create({}, combinators.identity),
                mockedLogger = Logger.create(),
                mockedImposterState = { foo: 'bar', counter: 0 },
                fn = function (request, state, logger, deferred, imposterState) {
                    imposterState.foo = 'barbar';
                    imposterState.counter += 1;
                    return imposterState.foo + imposterState.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return mockedResolver.resolve(responseConfig, request, mockedLogger, [], mockedImposterState).then(function (response) {
                assert.strictEqual(response, 'barbar1');
                return mockedResolver.resolve(responseConfig, request, mockedLogger, [], mockedImposterState);
            }).then(function (response) {
                assert.strictEqual(response, 'barbar2');
            });
        });

        promiseIt('should allow wait behavior', function () {
            var start = Date.now();

            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: 50 }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function () {
                var end = Date.now();
                var elapsed = end - start;

                // allow some approximation
                assert.ok(elapsed >= 45, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should allow wait behavior based on a function', function () {
            var start = Date.now();

            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = function () {
                    return 50;
                },
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function () {
                var end = Date.now();
                var elapsed = end - start;

                // allow for some lack of precision
                assert.ok(elapsed >= 48, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should reject the promise when the wait function fails', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = function () {
                    throw new Error('Error message');
                },
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(function () {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.equal(error.message, 'invalid wait injection');
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                fn = function (request, state, logger, callback) {
                    setTimeout(function () {
                        callback('value');
                    }, 1);
                },
                responseConfig = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, { debug: mock() }, []).then(function (response) {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = function (request) {
                    request.key = 'CHANGED';
                    return 0;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'ORIGINAL' };

            return resolver.resolve(responseConfig, request, logger, []).then(function () {
                assert.strictEqual(request.key, 'ORIGINAL');
            });
        });

        promiseIt('should not run injection during dry run validation', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = function () {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn.toString() },
                request = { isDryRun: true };

            return resolver.resolve(responseConfig, request, logger, []).then(function (response) {
                assert.deepEqual(response, {});
            });
        });

        promiseIt('should throw error if multiple response types given', function () {
            var resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                responseConfig = { is: 'value', proxy: { to: 'http://www.google.com' } };

            return resolver.resolve(responseConfig, {}, logger, []).then(function () {
                assert.fail('should not have resolved');
            }, function (error) {
                assert.strictEqual(error.message, 'each response object must have only one response type');
            });
        });
    });
});
