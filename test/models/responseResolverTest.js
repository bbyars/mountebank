'use strict';

const assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    StubRepository = require('../../src/models/inMemoryStubRepository'),
    helpers = require('../../src/util/helpers'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    Logger = require('../fakes/fakeLogger'),
    util = require('util');

describe('responseResolver', function () {

    function cleanedProxyResponse (response) {
        if (helpers.defined(response.is)) {
            delete response.is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
        }
        return response;
    }

    function proxyResponses (responses) {
        return responses.map(response => cleanedProxyResponse(response));
    }

    function stubListFor (stubs) {
        return stubs.all().then(result => {
            result.forEach(stub => {
                delete stub.recordMatch;
                delete stub.addResponse;
                delete stub.deleteResponsesMatching;
                stub.responses = proxyResponses(stub.responses);
            });
            return result;
        });
    }

    function getResponseFrom (stubs) {
        // Simulates what the imposter / stubRepository do with the added functions
        return stubs.first(stub => (stub.predicates || []).length === 0)
            .then(match => {
                const result = match.stub.nextResponse();
                result.stubIndex = () => match.index;
                return result;
            });
    }

    describe('#resolve', function () {
        promiseIt('should resolve "is" without transformation', function () {
            const proxy = {},
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            return resolver.resolve(responseConfig, 'request', logger, {}).then(response => {
                assert.strictEqual(response, 'value');
            });
        });

        promiseIt('should resolve "proxy" by delegating to the proxy for in process resolution', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            return stubs.add({ responses: [{ proxy: { to: 'where' } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, 'request', logger, {}))
                .then(response => {
                    assert.strictEqual(response.key, 'value');
                    assert.ok(proxy.to.wasCalledWith('where', 'request', {
                        to: 'where',
                        mode: 'proxyOnce'
                    }), proxy.to.message());
                });
        });

        promiseIt('should resolve "proxy" by returning proxy configuration for out of process resolution', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK URL'),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            return stubs.add({ responses: [{ proxy: { to: 'where' } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, 'request', logger, {}))
                .then(response => {
                    assert.deepEqual(response, {
                        proxy: { to: 'where', mode: 'proxyOnce' },
                        request: 'request',
                        callbackURL: 'CALLBACK URL/0'
                    });
                });
        });

        promiseIt('should default to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            return stubs.add({ responses: [{ proxy: { to: 'where' } }] }).then(() => {
                return getResponseFrom(stubs);
            }).then(responseConfig => {
                return resolver.resolve(responseConfig, 'request', logger, {}).then(() => {
                    assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
                });
            });
        });

        promiseIt('should change unrecognized mode to "proxyOnce" mode', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            return stubs.add({ responses: [{ proxy: { to: 'where', mode: 'unrecognized' } }] }).then(() => {
                return getResponseFrom(stubs);
            }).then(responseConfig => {
                return resolver.resolve(responseConfig, 'request', logger, {}).then(() => {
                    assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
                });
            });
        });

        promiseIt('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            return stubs.add({ responses: [], predicates: [{ equals: { ignore: 'true' } }] })
                .then(() => stubs.add({ responses: [{ proxy: { to: 'where' } }] }))
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, {}, logger, {}))
                .then(response => {
                    assert.strictEqual(response.key, 'value');
                    return stubs.all();
                }).then(all => {
                    const stubResponses = all.map(stub => proxyResponses(stub.responses));
                    assert.deepEqual(stubResponses, [
                        [],
                        [{ is: { key: 'value' } }],
                        [{ proxy: { to: 'where', mode: 'proxyOnce' } }]
                    ]);
                });
        });

        promiseIt('should support adding wait behavior to newly created stub for in process imposters', function () {
            const proxy = { to: mock().returns(Q.delay(100).then(() => Q({ data: 'value' }))) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            return stubs.add({ responses: [{ proxy: { to: 'where', addWaitBehavior: true } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubs.all())
                .then(all => {
                    const stubResponses = all.map(stub => stub.responses),
                        wait = stubResponses[0][0].is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
                    assert.ok(wait > 90); // allow some variability
                    assert.deepEqual(stubResponses, [
                        [{ is: { data: 'value', _proxyResponseTime: wait }, _behaviors: { wait: wait } }],
                        [{ proxy: { to: 'where', addWaitBehavior: true, mode: 'proxyOnce' } }]
                    ]);
                });
        });

        promiseIt('should support adding wait behavior to newly created response in proxyAlways mode', function () {
            let call = 0;
            function proxyReturn () {
                return Q.delay(100).then(() => {
                    call += 1;
                    return Q({ data: call });
                });
            }

            const proxy = { to: proxyReturn },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            return stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => {
                    // First call adds the stub, second call adds a response
                    return resolver.resolve(responseConfig, request, logger, {})
                        .then(() => resolver.resolve(responseConfig, request, logger, {}));
                }).then(() => stubs.all())
                .then(all => {
                    const stubResponses = all.map(stub => stub.responses),
                        firstWait = stubResponses[1][0].is._proxyResponseTime, // eslint-disable-line no-underscore-dangle
                        secondWait = stubResponses[1][1].is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
                    assert.deepEqual(stubResponses, [
                        [{ proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } }],
                        [
                            { is: { data: 1, _proxyResponseTime: firstWait }, _behaviors: { wait: firstWait } },
                            { is: { data: 2, _proxyResponseTime: secondWait }, _behaviors: { wait: secondWait } }
                        ]
                    ]);
                });
        });

        promiseIt('should run behaviors on proxy response before recording it', function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; };
            const proxy = { to: mock().returns(Q({ data: 'RESPONSE' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: { to: 'where' },
                    _behaviors: { decorate: decorateFunc.toString() }
                },
                request = {};

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubs.all())
                .then(all => {
                    const stubResponses = all.map(stub => proxyResponses(stub.responses));
                    assert.deepEqual(stubResponses, [
                        [{ is: { data: 'RESPONSE-DECORATED' } }],
                        [{ proxy: { to: 'where', mode: 'proxyOnce' }, _behaviors: { decorate: decorateFunc.toString() } }]
                    ]);
                });
        });

        promiseIt('should support adding decorate behavior to newly created stub', function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            return stubs.add({ responses: [{ proxy: { to: 'where', addDecorateBehavior: decorateFunc } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubs.all())
                .then(all => {
                    const stubResponses = all.map(stub => proxyResponses(stub.responses));
                    assert.deepEqual(stubResponses, [
                        [{ is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }],
                        [{ proxy: { to: 'where', addDecorateBehavior: decorateFunc, mode: 'proxyOnce' } }]
                    ]);
                });
        });

        promiseIt('should support adding decorate behavior to newly created response in proxyAlways mode', function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Q({ data: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            return stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } }] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => {
                    // First call adds the stub, second call adds a response
                    return resolver.resolve(responseConfig, request, logger, {})
                        .then(() => resolver.resolve(responseConfig, request, logger, stubs));
                }).then(() => stubs.all())
                .then(all => {
                    const stubResponses = all.map(stub => proxyResponses(stub.responses));
                    assert.deepEqual(stubResponses, [
                        [{ proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } }],
                        [
                            { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } },
                            { is: { data: 'value' }, _behaviors: { decorate: decorateFunc } }
                        ]
                    ]);
                });
        });

        promiseIt('should resolve "proxy" and remember full objects as "deepEquals" predicates', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: {
                                    key: {
                                        nested: { first: 'one', second: 'two' },
                                        third: 'three'
                                    }
                                }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [{
                                proxy: { to: 'where', mode: 'proxyOnce', predicateGenerators: [{ matches: { key: true } }] }
                            }]
                        }
                    ]);
                });
        });

        promiseIt('should resolve "proxy" and remember nested keys as "equals" predicates', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{ matches: { key: { nested: { first: true } } } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{ equals: { key: { nested: { first: 'one' } } } }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [{
                                proxy: {
                                    to: 'where',
                                    mode: 'proxyOnce',
                                    predicateGenerators: [{ matches: { key: { nested: { first: true } } } }]
                                }
                            }]
                        }
                    ]);
                });
        });

        promiseIt('should add predicate parameters from predicateGenerators', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            matches: { key: true },
                            caseSensitive: true,
                            except: 'xxx'
                        }]
                    }
                },
                request = { key: 'Test' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { key: 'Test' },
                                caseSensitive: true,
                                except: 'xxx'
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should choose predicate operator from predicateGenerators', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            matches: { key: true },
                            predicateOperator: 'contains'
                        }]
                    }
                },
                request = { key: 'Test' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                contains: { key: 'Test' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should format exists matcher from predicateOperator', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            matches: { key: true },
                            predicateOperator: 'exists'
                        }]
                    }
                },
                request = { key: 'Test' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                exists: { key: true }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should format exists matcher from predicateOperator with nested match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            matches: { key: { nested: true } },
                            predicateOperator: 'exists'
                        }]
                    }
                },
                request = { key: { nested: 'Test' } };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                exists: { key: { nested: true } }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should support "inject" predicateGenerators', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            inject: 'function(config) { return [{ deepEquals: config.request, caseSensitive: true }, { not: { equals: { foo: "bar" }}}]; }'
                        }]
                    }
                },
                request = { key: 'Test' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { key: 'Test' },
                                caseSensitive: true
                            }, {
                                not: {
                                    equals: { foo: 'bar' }
                                }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should log "inject" predicateGenerator exceptions', function () {
            const errorsLogged = [],
                proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        mode: 'proxyOnce',
                        predicateGenerators: [{
                            inject: 'function(config) { throw Error("BOOM!!!"); }'
                        }]
                    }
                },
                request = { key: 'Test' };

            logger.error = function () {
                const message = util.format.apply(this, Array.prototype.slice.call(arguments));
                errorsLogged.push(message);
            };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => {
                    assert.fail('should have thrown exception');
                }).catch(error => {
                    assert.strictEqual(error.message, 'invalid predicateGenerator injection');
                    assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with one match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: '//title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: '<books><book><title>Harry Potter</title></book></books>' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: 'Harry Potter' },
                                xpath: { selector: '//title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with one match and a nested match key', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { parent: { child: true } },
                            xpath: { selector: '//title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { parent: { child: '<books><book><title>Harry Potter</title></book></books>' } };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                equals: { parent: { child: 'Harry Potter' } },
                                xpath: { selector: '//title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators with multiple matches', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: {
                                selector: '//isbn:title',
                                ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                            }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                xml = '<root xmlns:isbn="http://schemas.isbn.org/ns/1999/basic.dtd">' +
                      '  <isbn:book><isbn:title>Harry Potter</isbn:title></isbn:book>' +
                      '  <isbn:book><isbn:title>The Hobbit</isbn:title></isbn:book>' +
                      '  <isbn:book><isbn:title>Game of Thrones</isbn:title></isbn:book>' +
                      '</root>',
                request = { field: xml };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: ['Harry Potter', 'The Hobbit', 'Game of Thrones'] },
                                xpath: {
                                    selector: '//isbn:title',
                                    ns: { isbn: 'http://schemas.isbn.org/ns/1999/basic.dtd' }
                                }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators even if no xpath match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: '//title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: '<books />' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: '' },
                                xpath: { selector: '//title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators even if scalar xpath match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: 'count(//title)' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: '<doc><title>first</title><title>second</title></doc>' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: 2 },
                                xpath: { selector: 'count(//title)' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add xpath predicate parameter in predicateGenerators even if boolean match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            xpath: { selector: 'boolean(//title)' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: '<doc></doc>' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: false },
                                xpath: { selector: 'boolean(//title)' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with one match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: { title: 'Harry Potter' } };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: 'Harry Potter' },
                                jsonpath: { selector: '$..title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with multiple matches', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$.books[*].title' }
                        }],
                        mode: 'proxyOnce'
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

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: ['Harry Potter', 'The Hobbit', 'Game of Thrones'] },
                                jsonpath: { selector: '$.books[*].title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should add jsonpath predicate parameter in predicateGenerators with no match', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: false };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: '' },
                                jsonpath: { selector: '$..title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                });
        });

        promiseIt('should log warning if request not JSON', function () {
            const proxy = { to: mock().returns(Q({ key: 'value' })) },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{
                            matches: { field: true },
                            jsonpath: { selector: '$..title' }
                        }],
                        mode: 'proxyOnce'
                    }
                },
                request = { field: 'Hello, world' };

            return stubs.add({ responses: [response] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(() => stubListFor(stubs))
                .then(stubList => {
                    assert.deepEqual(stubList, [
                        {
                            predicates: [{
                                deepEquals: { field: '' },
                                jsonpath: { selector: '$..title' }
                            }],
                            responses: [{ is: { key: 'value' } }]
                        },
                        {
                            responses: [response]
                        }
                    ]);
                    logger.warn.assertLogged('Cannot parse as JSON: "Hello, world"');
                });
        });

        promiseIt('should allow "inject" response', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = request => request.data + ' injected',
                responseConfig = { inject: fn.toString() },
                request = { data: 'request' };

            return resolver.resolve(responseConfig, request, logger, {}).then(response => {
                assert.strictEqual(response, 'request injected');
            });
        });

        promiseIt('should log injection exceptions', function () {
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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

            const stubs = StubRepository.create(),
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

            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
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
            if (helpers.defined(response._proxyResponseTime)) { // eslint-disable-line no-underscore-dangle
                delete response._proxyResponseTime; // eslint-disable-line no-underscore-dangle
            }
            return response;
        }

        function matchesFor (stubs) {
            return stubs.all().then(all => {
                const matchList = all.map(stub => stub.matches || []);
                matchList.forEach(matchesForOneStub => {
                    matchesForOneStub.forEach(match => {
                        if (match.timestamp) {
                            match.timestamp = 'NOW';
                        }
                    });
                });
                return matchList;
            });
        }

        promiseIt('should error if called with invalid proxyResolutionKey', function () {
            const stubs = StubRepository.create(),
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
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyOnce' } },
                request = {};

            return stubs.add({ responses: [responseConfig] }).then(() => {
                responseConfig.stubIndex = () => 0;
                return resolver.resolve(responseConfig, request, logger, {});
            }).then(response => {
                const proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                assert.deepEqual(jsonResponse(response), { data: 'RESPONSE' });
                return stubs.all();
            }).then(all => {
                const stubResponses = all.map(stub => proxyResponses(stub.responses));
                delete responseConfig.stubIndex;
                assert.deepEqual(stubResponses, [
                    [{ is: { data: 'RESPONSE' } }],
                    [responseConfig]
                ]);
            });
        });

        promiseIt('should save new response after proxy for "proxyAlways" mode', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways' } },
                request = {};

            return stubs.add({ responses: [responseConfig] }).then(() => {
                responseConfig.stubIndex = () => 0;
                return resolver.resolve(responseConfig, request, logger, {});
            }).then(response => {
                const proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                assert.deepEqual(jsonResponse(response), { data: 'RESPONSE' });
                return stubs.all();
            }).then(all => {
                const stubResponses = all.map(stub => proxyResponses(stub.responses));
                delete responseConfig.stubIndex;
                assert.deepEqual(stubResponses, [
                    [responseConfig],
                    [{ is: { data: 'RESPONSE' } }]
                ]);
            });
        });

        promiseIt('should run behaviors from original proxy config on proxy response before recording it', function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; },
                stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = {
                    proxy: { to: 'where', mode: 'proxyOnce' },
                    _behaviors: { decorate: decorateFunc.toString() }
                },
                request = {};

            return stubs.add({ responses: [proxyResponse] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(response => {
                    const proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                    return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
                }).then(response => {
                    assert.deepEqual(jsonResponse(response), { data: 'RESPONSE-DECORATED' });
                    return stubs.all();
                }).then(all => {
                    const stubResponses = all.map(stub => proxyResponses(stub.responses));
                    assert.deepEqual(stubResponses, [
                        [{ is: { data: 'RESPONSE-DECORATED' } }],
                        [proxyResponse]
                    ]);
                });
        });

        promiseIt('should add wait behavior based on the proxy resolution time', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = { proxy: { to: 'where', mode: 'proxyOnce', addWaitBehavior: true } },
                request = {};

            return stubs.add({ responses: [proxyResponse] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(response => {
                    const proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                    return Q.delay(proxyResolutionKey, 100);
                }).then(proxyResolutionKey =>
                    resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger)
                ).then(() => {
                    return stubs.all();
                }).then(all => {
                    const stubResponses = all.map(stub => stub.responses),
                        wait = stubResponses[0][0].is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
                    assert.ok(wait > 90); // allow some variability
                    assert.deepEqual(stubResponses, [
                        [{ is: { data: 'RESPONSE', _proxyResponseTime: wait }, _behaviors: { wait: wait } }],
                        [proxyResponse]
                    ]);
                });
        });

        promiseIt('should support recording the match', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                request = { key: 'REQUEST' };

            return stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyOnce' } }] }).then(() => {
                // Call through the stubRepository to have it add the recordMatch function
                return getResponseFrom(stubs);
            }).then(responseConfig => {
                return resolver.resolve(responseConfig, request, logger, {});
            }).then(response => {
                const proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                response.recordMatch();
                return matchesFor(stubs);
            }).then(matches => {
                assert.deepEqual(matches, [
                    [],
                    [{ timestamp: 'NOW', request: { key: 'REQUEST' }, response: { data: 'RESPONSE' } }]
                ]);
            });
        });

        promiseIt('should avoid race conditions when recording the match', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create();
            let proxyResolutionKey;

            return stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyAlways' } }] }).then(() => {
                // Call through the stubRepository to have it add the recordMatch function
                return getResponseFrom(stubs);
            }).then(responseConfig => {
                return resolver.resolve(responseConfig, { key: 'REQUEST-1' }, logger, {});
            }).then(response => {
                proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
                return getResponseFrom(stubs);
            }).then(responseConfig => {
                // Now call with a second request on the same stub before resolving the proxy
                return resolver.resolve(responseConfig, { key: 'REQUEST-2' }, logger, {});
            }).then(() => {
                return resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            }).then(response => {
                response.recordMatch();
                return matchesFor(stubs);
            }).then(matches => {
                assert.deepEqual(matches, [
                    [{ timestamp: 'NOW', request: { key: 'REQUEST-1' }, response: { data: 'RESPONSE' } }],
                    []
                ]);
            });
        });

        promiseIt('should not resolve the same proxyResolutionKey twice', function () {
            const stubs = StubRepository.create(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = { proxy: { to: 'where' } },
                request = {};
            let proxyResolutionKey;

            return stubs.add({ responses: [proxyResponse] })
                .then(() => getResponseFrom(stubs))
                .then(responseConfig => resolver.resolve(responseConfig, request, logger, {}))
                .then(response => {
                    proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));

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
