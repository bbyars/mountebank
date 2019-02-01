'use strict';

const assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    StubRepository = require('../../src/models/stubRepository'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    Logger = require('../fakes/fakeLogger');

describe('responseResolver', function () {

    function stubList (stubs) {
        const result = stubs.stubs();
        result.forEach(stub => {
            delete stub.recordMatch;
            delete stub.addResponse;
        });
        return result;
    }

    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            const proxy = {},
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(response => {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy for in process resolution', function () {
            const proxy = { to: mock().returns(Q('value')) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(response => {
                assert.strictEqual(response, 'value');
                assert.ok(proxy.to.wasCalledWith('where', 'request', {
                    to: 'where',
                    mode: 'proxyOnce'
                }), proxy.to.message());
            });
        });

        promiseIt('should resolve "proxy" by returning proxy configuration for out of process resolution', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(response => {
                assert.deepEqual(response, {
                    proxy: { to: 'where', mode: 'proxyOnce' },
                    request: 'request',
                    callbackUrl: 'CALLBACK URL/0'
                });
            });
        });

        promiseIt('should default to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q('value')) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(() => {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q('value')) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'unrecognized' } };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(() => {
                assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
            });
        });

        promiseIt('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', function () {
            const proxy = { to: mock().returns(Q('value')) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } };

            stubs.addStub({ responses: [] });
            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, {}, logger, {}).then(response => {
                assert.strictEqual(response, 'value');
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [],
                    [{ is: 'value' }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should support adding wait behavior to newly created stub for in process imposters', function () {
            const proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addWaitBehavior: true } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should support adding wait behavior to newly created response in proxyAlways mode', function () {
            const proxy = { to: mock().returns(Q({ data: 'value', _proxyResponseTime: 100 })) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() =>
                // First call adds the stub, second call adds a response
                resolver.resolve(responseConfig, request, logger, {})
            ).then(() => {
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [responseConfig],
                    [
                        { is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } },
                        { is: { data: 'value', _proxyResponseTime: 100 }, _behaviors: { wait: 100 } }
                    ]
                ]);
            });
        });

        promiseIt('should run behaviors on proxy response before recording it', function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; };
            const proxy = { to: mock().returns(Q({ data: 'RESPONSE' })) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = {
                    proxy: { to: 'where' },
                    _behaviors: { decorate: decorateFunc.toString() }
                },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'RESPONSE-DECORATED' } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should support adding decorate behavior to newly created stub', function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', addDecorateBehavior: decorateFunc } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should support adding decorate behavior to newly created response in proxyAlways mode', function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() =>
                // First call adds the stub, second call adds a response
                resolver.resolve(responseConfig, request, logger, stubs)
            ).then(() => {
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [responseConfig],
                    [
                        { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } },
                        { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }
                    ]
                ]);
            });
        });

        promiseIt('should resolve "proxy" and remember full objects as "deepEquals" predicates', function () {
            const proxy = { to: mock().returns(Q('value')) },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{ matches: { key: { nested: { first: true } } } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { key: 'Test' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: '<books><book><title>Harry Potter</title></book></books>' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { parent: { child: '<books><book><title>Harry Potter</title></book></books>' } };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: xml };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: '<books />' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: '<doc><title>first</title><title>second</title></doc>' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: '<doc></doc>' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: { title: 'Harry Potter' } };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: false };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, proxy),
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
                request = { field: 'Hello, world' };

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.deepEqual(stubList(stubs), [
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
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = request => request.key + ' injected',
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn };

            return resolver.resolve(responseConfig, {}, logger, {}).then(() => {
                assert.fail('should not have resolved');
            }, error => {
                assert.strictEqual(error.message, 'invalid response injection');
                logger.error.assertLogged('injection X=> Error: BOOM!!!');
            });
        });

        promiseIt('should allow injection request state across calls to resolve', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = (request, state) => {
                    state.counter = state.counter || 0;
                    state.counter += 1;
                    return state.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                assert.strictEqual(response, 1);
                return resolver.resolve(responseConfig, request, logger, []);
            }).then(response => {
                assert.strictEqual(response, 2);
            });
        });

        promiseIt('should allow injection imposter state across calls to resolve', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                mockedLogger = Logger.create(),
                imposterState = { foo: 'bar', counter: 0 },
                fn = (request, localState, logger, deferred, globalState) => {
                    globalState.foo = 'barbar';
                    globalState.counter += 1;
                    return globalState.foo + globalState.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, mockedLogger, imposterState).then(response => {
                assert.strictEqual(response, 'barbar1');
                return resolver.resolve(responseConfig, request, mockedLogger, imposterState);
            }).then(response => {
                assert.strictEqual(response, 'barbar2');
            });
        });

        promiseIt('should allow wait behavior', function () {
            const start = Date.now();

            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: 50 }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                const end = Date.now();
                const elapsed = end - start;

                // allow some approximation
                assert.ok(elapsed >= 45, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should allow wait behavior based on a function', function () {
            const start = Date.now();

            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => 50,
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                const end = Date.now();
                const elapsed = end - start;

                // allow for some lack of precision
                assert.ok(elapsed >= 48, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
            });
        });

        promiseIt('should reject the promise when the wait function fails', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw new Error('Error message');
                },
                responseConfig = {
                    is: 'value',
                    _behaviors: { wait: fn.toString() }
                },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, error => {
                assert.equal(error.message, 'invalid wait injection');
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                fn = (request, state, logger, callback) => {
                    setTimeout(() => {
                        callback('value');
                    }, 1);
                },
                responseConfig = { inject: fn },
                request = { key: 'request' };

            return resolver.resolve(responseConfig, request, { debug: mock() }, {}).then(response => {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = request => {
                    request.key = 'CHANGED';
                    return 0;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'ORIGINAL' };

            return resolver.resolve(responseConfig, request, logger, {}).then(() => {
                assert.strictEqual(request.key, 'ORIGINAL');
            });
        });

        promiseIt('should not run injection during dry run validation', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn.toString() },
                request = { isDryRun: true };

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                assert.deepEqual(response, {});
            });
        });

        promiseIt('should throw error if multiple response types given', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                responseConfig = { is: 'value', proxy: { to: 'http://www.google.com' } };

            return resolver.resolve(responseConfig, {}, logger, {}).then(() => {
                assert.fail('should not have resolved');
            }, error => {
                assert.strictEqual(error.message, 'each response object must have only one response type');
            });
        });
    });

    describe('#resolveProxy', function () {
        function jsonResponse (response) {
            delete response.recordMatch;
            return response;
        }

        function matches (stubs) {
            const matchList = stubs.stubs().map(stub => stub.matches || []);
            matchList.forEach(matchesForOneStub => {
                matchesForOneStub.forEach(match => {
                    if (match.timestamp) {
                        match.timestamp = 'NOW';
                    }
                });
            });
            return matchList;
        }

        promiseIt('should error if called with invalid proxyResolutionKey', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create();

            return resolver.resolveProxy({ field: 'value' }, 0, logger).then(() => {
                assert.fail('should have errored');
            }, error => {
                assert.deepEqual(error, {
                    code: 'no such resource',
                    message: 'invalid proxy resolution key',
                    source: 'CALLBACK-URL/0'
                });
                logger.error.assertLogged('Invalid proxy resolution key: 0');
            });
        });

        promiseIt('should save new response in front of proxy for "proxyOnce" mode', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyOnce' } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                const proxyResolutionKey = parseInt(response.callbackUrl.replace('CALLBACK-URL/', ''));

                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                assert.deepEqual(jsonResponse(response), { data: 'RESPONSE' });
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'RESPONSE' } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should save new response after proxy for "proxyAlways" mode', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways' } },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                const proxyResolutionKey = parseInt(response.callbackUrl.replace('CALLBACK-URL/', ''));

                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                assert.deepEqual(jsonResponse(response), { data: 'RESPONSE' });
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [responseConfig],
                    [{ is: { data: 'RESPONSE' } }]
                ]);
            });
        });

        promiseIt('should run behaviors from original proxy config on proxy response before recording it', function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; },
                stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = {
                    proxy: { to: 'where' },
                    _behaviors: { decorate: decorateFunc.toString() }
                },
                request = {};

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                const proxyResolutionKey = parseInt(response.callbackUrl.replace('CALLBACK-URL/', ''));

                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                assert.deepEqual(jsonResponse(response), { data: 'RESPONSE-DECORATED' });
                const stubResponses = stubs.stubs().map(stub => stub.responses);
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'RESPONSE-DECORATED' } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should support recording the match', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                request = { key: 'REQUEST' };

            stubs.addStub({ responses: [{ proxy: { to: 'where', mode: 'proxyOnce' } }] });

            // Call through the stubRepository to have it add the recordMatch function
            const responseConfig = stubs.getResponseFor(request, logger, {});
            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                const proxyResolutionKey = parseInt(response.callbackUrl.replace('CALLBACK-URL/', ''));

                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                response.recordMatch();
                assert.deepEqual(matches(stubs), [
                    [],
                    [{ timestamp: 'NOW', request: { key: 'REQUEST' }, response: { data: 'RESPONSE' } }]
                ]);
            });
        });

        promiseIt('should not resolve the same proxyResolutionKey twice', function () {
            const stubs = StubRepository.create('utf8'),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where' } },
                request = {};
            let proxyResolutionKey;

            stubs.addStub({ responses: [responseConfig] });

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                proxyResolutionKey = parseInt(response.callbackUrl.replace('CALLBACK-URL/', ''));

                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(() => resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger)).then(() => {
                assert.fail('should have errored');
            }, error => {
                assert.deepEqual(error, {
                    code: 'no such resource',
                    message: 'invalid proxy resolution key',
                    source: 'CALLBACK-URL/0'
                });
                logger.error.assertLogged('Invalid proxy resolution key: 0');
            });
        });
    });
});
