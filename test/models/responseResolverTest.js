'use strict';

const assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    combinators = require('../../src/util/combinators'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    Logger = require('../fakes/fakeLogger');

describe('responseResolver', function () {
    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            const proxy = {},
                postProcess = combinators.identity,
                resolver = ResponseResolver.create(proxy, postProcess),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, {}, logger, []).then(response => {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should post process the result', function () {
            const postProcess = (response, request) => response.toUpperCase() + '-' + request.value,
                resolver = ResponseResolver.create({}, postProcess),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, { value: 'REQUEST' }, logger, []).then(response => {
                assert.strictEqual(response, 'VALUE-REQUEST');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(response => {
                assert.strictEqual(response, 'value');
                assert.ok(proxy.to.wasCalledWith('where', 'request', {
                    to: 'where',
                    mode: 'proxyOnce'
                }), proxy.to.message());
            });
        });

        promiseIt('should default to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(() => {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'unrecognized' } };

            return resolver.resolve(responseConfig, 'request', logger, []).then(() => {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } },
                request = {},
                stubs = [{ responses: [] }, { responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(response => {
                assert.strictEqual(response, 'value');
                assert.deepEqual(stubs, [
                    { responses: [] },
                    { responses: [{ is: 'value' }], predicates: {} },
                    { responses: [responseConfig] }
                ]);
            });
        });

        promiseIt('should support adding wait behavior to newly created stub', function () {
            const proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addWaitBehavior: true } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
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
            const proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() =>
                // First call adds the stub, second call adds a response
                resolver.resolve(responseConfig, request, logger, stubs)
            ).then(() => {
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
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addDecorateBehavior: decorateFunc } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    { responses: [{ is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }], predicates: [] },
                    { responses: [responseConfig] }
                ]);
            });
        });

        promiseIt('should support adding decorate behavior to newly created response in proxyAlways mode', function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } },
                request = {},
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() =>
                // First call adds the stub, second call adds a response
                resolver.resolve(responseConfig, request, logger, stubs)
            ).then(() => {
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
            const proxy = { to: mock().returns(Q('value')) },
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

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
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
            const proxy = { to: mock().returns(Q('value')) },
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

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
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
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { key: true },
                            caseSensitive: true,
                            except: 'xxx'
                        }]
                    }
                },
                request = { key: 'Test' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { key: 'Test' },
                            caseSensitive: true,
                            except: 'xxx'
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with one match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: '//title' }
                        }]
                    }
                },
                request = { field: '<books><book><title>Harry Potter</title></book></books>' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: 'Harry Potter' },
                            xpath: { selector: '//title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with one match and a nested match key', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { parent: { child: true } },
                            xpath: { selector: '//title' }
                        }]
                    }
                },
                request = { parent: { child: '<books><book><title>Harry Potter</title></book></books>' } },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            equals: { parent: { child: 'Harry Potter' } },
                            xpath: { selector: '//title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with multiple matches', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: {
                                selector: '//isbn:title',
                                ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
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

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: ['Harry Potter', 'The Hobbit', 'Game of Thrones'] },
                            xpath: {
                                selector: '//isbn:title',
                                ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
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

        promiseIt('should add xpath predicate parameter in predicateGenerators even if no xpath match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: '//title' }
                        }]
                    }
                },
                request = { field: '<books />' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: '' },
                            xpath: { selector: '//title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators even if scalar xpath match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: 'count(//title)' }
                        }]
                    }
                },
                request = { field: '<doc><title>first</title><title>second</title></doc>' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: 2 },
                            xpath: { selector: 'count(//title)' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators even if boolean match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: 'boolean(//title)' }
                        }]
                    }
                },
                request = { field: '<doc></doc>' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: false },
                            xpath: { selector: 'boolean(//title)' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with one match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }]
                    }
                },
                request = { field: { title: 'Harry Potter' } },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: 'Harry Potter' },
                            jsonpath: { selector: '$..title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with multiple matches', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$.books[*].title' }
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

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: ['Harry Potter', 'The Hobbit', 'Game of Thrones'] },
                            jsonpath: { selector: '$.books[*].title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with no match', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }]
                    }
                },
                request = { field: false },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: '' },
                            jsonpath: { selector: '$..title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
            });
        });

        promiseIt('should log warning if request not JSON', function () {
            const proxy = { to: mock().returns(Q('value')) },
                resolver = ResponseResolver.create(proxy, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }]
                    }
                },
                request = { field: 'Hello, world' },
                stubs = [{ responses: [responseConfig] }];

            return resolver.resolve(responseConfig, request, logger, stubs).then(() => {
                assert.deepEqual(stubs, [
                    {
                        predicates: [{
                            deepEquals: { field: '' },
                            jsonpath: { selector: '$..title' }
                        }],
                        responses: [{ is: 'value' }]
                    },
                    {
                        responses: [responseConfig]
                    }
                ]);
                logger.warn.assertLogged('Cannot parse as JSON: "Hello, world"');
            });
        });

        promiseIt('should allow "inject" response', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = request => request.key + ' injected',
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(response => {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn };

            return resolver.resolve(responseConfig, {}, logger, []).then(() => {
                assert.fail('should not have resolved');
            }, error => {
                assert.strictEqual(error.message, 'invalid response injection');
                logger.error.assertLogged('injection X=> Error: BOOM!!!');
            });
        });

        promiseIt('should allow injection request state across calls to resolve', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = (request, state) => {
                    state.counter = state.counter || 0;
                    state.counter += 1;
                    return state.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(response => {
                assert.strictEqual(response, 1);
                return resolver.resolve(responseConfig, request, logger, []);
            }).then(response => {
                assert.strictEqual(response, 2);
            });
        });


        promiseIt('should allow injection imposter state across calls to resolve', function () {
            const mockedResolver = ResponseResolver.create({}, combinators.identity),
                mockedLogger = Logger.create(),
                mockedImposterState = { foo: 'bar', counter: 0 },
                fn = (request, state, logger, deferred, imposterState) => {
                    imposterState.foo = 'barbar';
                    imposterState.counter += 1;
                    return imposterState.foo + imposterState.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return mockedResolver.resolve(responseConfig, request, mockedLogger, [], mockedImposterState).then(response => {
                assert.strictEqual(response, 'barbar1');
                return mockedResolver.resolve(responseConfig, request, mockedLogger, [], mockedImposterState);
            }).then(response => {
                assert.strictEqual(response, 'barbar2');
            });
        });

        promiseIt('should allow wait behavior', function () {
            const start = Date.now();

            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: 50 }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(() => {
                const end = Date.now();
                const elapsed = end - start;

                // allow some approximation
                assert.ok(elapsed >= 45, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should allow wait behavior based on a function', function () {
            const start = Date.now();

            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = () => 50,
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(() => {
                const end = Date.now();
                const elapsed = end - start;

                // allow for some lack of precision
                assert.ok(elapsed >= 48, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should reject the promise when the wait function fails', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = () => {
                    throw new Error('Error message');
                },
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, []).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, error => {
                assert.equal(error.message, 'invalid wait injection');
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                fn = (request, state, logger, callback) => {
                    setTimeout(() => {
                        callback('value');
                    }, 1);
                },
                responseConfig = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, { debug: mock() }, []).then(response => {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = request => {
                    request.key = 'CHANGED';
                    return 0;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'ORIGINAL' };

            return resolver.resolve(responseConfig, request, logger, []).then(() => {
                assert.strictEqual(request.key, 'ORIGINAL');
            });
        });

        promiseIt('should not run injection during dry run validation', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn.toString() },
                request = { isDryRun: true };

            return resolver.resolve(responseConfig, request, logger, []).then(response => {
                assert.deepEqual(response, {});
            });
        });

        promiseIt('should throw error if multiple response types given', function () {
            const resolver = ResponseResolver.create({}, combinators.identity),
                logger = Logger.create(),
                responseConfig = { is: 'value', proxy: { to: 'http://www.google.com' } };

            return resolver.resolve(responseConfig, {}, logger, []).then(() => {
                assert.fail('should not have resolved');
            }, error => {
                assert.strictEqual(error.message, 'each response object must have only one response type');
            });
        });
    });
});
