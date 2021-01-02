'use strict';

const assert = require('assert'),
    ResponseResolver = require('../../src/models/responseResolver'),
    createStubsRepository = require('../../src/models/inMemoryImpostersRepository').create().createStubsRepository,
    helpers = require('../../src/util/helpers'),
    mock = require('../mock').mock,
    Logger = require('../fakes/fakeLogger'),
    util = require('util');

describe('responseResolver', function () {

    function cleanedProxyResponse (response) {
        if (helpers.defined(response.is)) {
            delete response.is._proxyResponseTime;
        }
        return response;
    }

    function proxyResponses (responses) {
        return responses.map(response => cleanedProxyResponse(response));
    }

    async function stubListFor (stubs) {
        const result = await stubs.toJSON();
        result.forEach(stub => {
            stub.responses = proxyResponses(stub.responses);
        });
        return result;
    }

    async function getResponseFrom (stubs) {
        // Simulates what the imposter / stubRepository do
        const match = await stubs.first(predicates => predicates.length === 0),
            response = await match.stub.nextResponse();
        return response;
    }

    async function delay (duration) {
        return new Promise(resolve => {
            setTimeout(resolve, duration);
        });
    }

    describe('#resolve', function () {
        it('should resolve "is" without transformation', async function () {
            const proxy = {},
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                responseConfig = { is: 'value' };

            const response = await resolver.resolve(responseConfig, 'request', logger, {});

            assert.strictEqual(response, 'value');
        });

        it('should resolve "proxy" by delegating to the proxy for in process resolution', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            await stubs.add({ responses: [{ proxy: { to: 'where' } }] });
            const responseConfig = await getResponseFrom(stubs),
                response = await resolver.resolve(responseConfig, 'request', logger, {});

            assert.strictEqual(response.key, 'value');
            assert.ok(proxy.to.wasCalledWith('where', 'request', {
                to: 'where',
                mode: 'proxyOnce'
            }), proxy.to.message());
        });

        it('should resolve "proxy" by returning proxy configuration for out of process resolution', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK URL'),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            await stubs.add({ responses: [{ proxy: { to: 'where' } }] });
            const responseConfig = await getResponseFrom(stubs),
                response = await resolver.resolve(responseConfig, 'request', logger, {});

            assert.deepEqual(response, {
                proxy: { to: 'where', mode: 'proxyOnce' },
                request: 'request',
                callbackURL: 'CALLBACK URL/0'
            });
        });

        it('should default to "proxyOnce" mode', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            await stubs.add({ responses: [{ proxy: { to: 'where' } }] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, 'request', logger, {});

            assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
        });

        it('should change unrecognized mode to "proxyOnce" mode', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            // Call through the stubRepository to have it add the setMetadata function
            await stubs.add({ responses: [{ proxy: { to: 'where', mode: 'unrecognized' } }] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, 'request', logger, {});

            assert.strictEqual(responseConfig.proxy.mode, 'proxyOnce');
        });

        it('should resolve proxy in proxyOnce mode by adding a new "is" stub to the front of the list', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create();

            await stubs.add({ responses: [], predicates: [{ equals: { ignore: 'true' } }] });
            await stubs.add({ responses: [{ proxy: { to: 'where' } }] });
            const responseConfig = await getResponseFrom(stubs),
                response = await resolver.resolve(responseConfig, {}, logger, {}),
                all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.strictEqual(response.key, 'value');
            assert.deepEqual(stubResponses, [
                [],
                [{ is: { key: 'value' } }],
                [{ proxy: { to: 'where' } }]
            ]);
        });

        it('should support adding wait behavior to newly created stub for in process imposters', async function () {
            const proxy = { to: mock().returns(delay(100).then(() => Promise.resolve({ data: 'value' }))) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            await stubs.add({ responses: [{ proxy: { to: 'where', addWaitBehavior: true } }] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => stub.responses),
                wait = stubResponses[0][0].is._proxyResponseTime;

            assert.ok(wait > 90); // allow some variability
            assert.deepEqual(stubResponses, [
                [{ is: { data: 'value', _proxyResponseTime: wait }, behaviors: [{ wait: wait }] }],
                [{ proxy: { to: 'where', addWaitBehavior: true } }]
            ]);
        });

        it('should support adding wait behavior to newly created response in proxyAlways mode', async function () {
            let call = 0;
            async function proxyReturn () {
                await delay(100);
                call += 1;
                return { data: call };
            }

            const proxy = { to: proxyReturn },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            await stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } }] });
            const responseConfig = await getResponseFrom(stubs);

            // First call adds the stub, second call adds a response
            await resolver.resolve(responseConfig, request, logger, {});
            await resolver.resolve(responseConfig, request, logger, {});

            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => stub.responses),
                firstWait = stubResponses[1][0].is._proxyResponseTime,
                secondWait = stubResponses[1][1].is._proxyResponseTime;

            assert.deepEqual(stubResponses, [
                [{ proxy: { to: 'where', mode: 'proxyAlways', addWaitBehavior: true } }],
                [
                    { is: { data: 1, _proxyResponseTime: firstWait }, behaviors: [{ wait: firstWait }] },
                    { is: { data: 2, _proxyResponseTime: secondWait }, behaviors: [{ wait: secondWait }] }
                ]
            ]);
        });

        it('should run behaviors on proxy response before recording it', async function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; };
            const proxy = { to: mock().returns(Promise.resolve({ data: 'RESPONSE' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: { to: 'where' },
                    behaviors: [{ decorate: decorateFunc.toString() }]
                },
                request = {};

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(stubResponses, [
                [{ is: { data: 'RESPONSE-DECORATED' } }],
                [{ proxy: { to: 'where' }, behaviors: [{ decorate: decorateFunc.toString() }] }]
            ]);
        });

        it('should support adding decorate behavior to newly created stub', async function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Promise.resolve({ data: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            await stubs.add({ responses: [{ proxy: { to: 'where', addDecorateBehavior: decorateFunc } }] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(stubResponses, [
                [{ is: { data: 'value' }, behaviors: [{ decorate: decorateFunc }] }],
                [{ proxy: { to: 'where', addDecorateBehavior: decorateFunc } }]
            ]);
        });

        it('should support adding decorate behavior to newly created response in proxyAlways mode', async function () {
            const decorateFunc = '(request, response) => {}';
            const proxy = { to: mock().returns(Promise.resolve({ data: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                request = {};

            await stubs.add({ responses: [{ proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } }] });
            const responseConfig = await getResponseFrom(stubs);

            // First call adds the stub, second call adds a response
            await resolver.resolve(responseConfig, request, logger, {});
            await resolver.resolve(responseConfig, request, logger, stubs);
            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(stubResponses, [
                [{ proxy: { to: 'where', mode: 'proxyAlways', addDecorateBehavior: decorateFunc } }],
                [
                    { is: { data: 'value' }, behaviors: [{ decorate: decorateFunc }] },
                    { is: { data: 'value' }, behaviors: [{ decorate: decorateFunc }] }
                ]
            ]);
        });

        it('should resolve "proxy" and remember full objects as "deepEquals" predicates', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, proxy),
                logger = Logger.create(),
                response = {
                    proxy: {
                        to: 'where',
                        predicateGenerators: [{ matches: { key: true } }]
                    }
                },
                request = { key: { nested: { first: 'one', second: 'two' }, third: 'three' } };

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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
                        proxy: { to: 'where', predicateGenerators: [{ matches: { key: true } }] }
                    }]
                }
            ]);
        });

        it('should resolve "proxy" and remember nested keys as "equals" predicates', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add predicate parameters from predicateGenerators', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should choose predicate operator from predicateGenerators', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should format exists matcher from predicateOperator', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should format exists matcher from predicateOperator with nested match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should support "inject" predicateGenerators', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should log "inject" predicateGenerator exceptions', async function () {
            const errorsLogged = [],
                proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);

            try {
                await resolver.resolve(responseConfig, request, logger, {});
                assert.fail('should have thrown exception');
            }
            catch (error) {
                assert.strictEqual(error.message, 'invalid predicateGenerator injection');
                assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
            }
        });

        it('should add xpath predicate parameter in predicateGenerators with one match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add xpath predicate parameter in predicateGenerators with one match and a nested match key', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add xpath predicate parameter in predicateGenerators with multiple matches', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add xpath predicate parameter in predicateGenerators even if no xpath match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add xpath predicate parameter in predicateGenerators even if scalar xpath match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add xpath predicate parameter in predicateGenerators even if boolean match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add jsonpath predicate parameter in predicateGenerators with one match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add jsonpath predicate parameter in predicateGenerators with multiple matches', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should add jsonpath predicate parameter in predicateGenerators with no match', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should log warning if request not JSON', async function () {
            const proxy = { to: mock().returns(Promise.resolve({ key: 'value' })) },
                stubs = createStubsRepository(),
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

            await stubs.add({ responses: [response] });
            const responseConfig = await getResponseFrom(stubs);
            await resolver.resolve(responseConfig, request, logger, {});
            const stubList = await stubListFor(stubs);

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

        it('should allow "inject" response', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = request => request.data + ' injected',
                responseConfig = { inject: fn.toString() },
                request = { data: 'request' };

            const response = await resolver.resolve(responseConfig, request, logger, {});

            assert.strictEqual(response, 'request injected');
        });

        it('should log injection exceptions', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn };

            try {
                await resolver.resolve(responseConfig, {}, logger, {});
                assert.fail('should not have resolved');
            }
            catch (error) {
                assert.strictEqual(error.message, 'invalid response injection');
                logger.error.assertLogged('injection X=> Error: BOOM!!!');
            }
        });

        it('should allow injection request state across calls to resolve', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = (request, state) => {
                    state.counter = state.counter || 0;
                    state.counter += 1;
                    return state.counter;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'request' };

            const firstResponse = await resolver.resolve(responseConfig, request, logger, {}),
                secondResponse = await resolver.resolve(responseConfig, request, logger, []);

            assert.strictEqual(firstResponse, 1);
            assert.strictEqual(secondResponse, 2);
        });

        it('should allow injection imposter state across calls to resolve', async function () {
            const stubs = createStubsRepository(),
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

            const firstResponse = await resolver.resolve(responseConfig, request, mockedLogger, imposterState),
                secondResponse = await resolver.resolve(responseConfig, request, mockedLogger, imposterState);

            assert.strictEqual(firstResponse, 'barbar1');
            assert.strictEqual(secondResponse, 'barbar2');
        });

        it('should allow wait behavior', async function () {
            const start = Date.now();

            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                responseConfig = {
                    is: 'value',
                    behaviors: [{ wait: 50 }]
                },
                request = { key: 'request' };

            await resolver.resolve(responseConfig, request, logger, {});
            const elapsed = Date.now() - start;

            // allow some approximation
            assert.ok(elapsed >= 45, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
        });

        it('should allow wait behavior based on a function', async function () {
            const start = Date.now();

            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => 50,
                responseConfig = {
                    is: 'value',
                    behaviors: [{ wait: fn.toString() }]
                },
                request = { key: 'request' };

            await resolver.resolve(responseConfig, request, logger, {});
            const elapsed = Date.now() - start;

            // allow for some lack of precision
            assert.ok(elapsed >= 48, 'Did not wait longer than 50 ms, only waited for ' + elapsed);
        });

        it('should reject the promise when the wait function fails', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw new Error('Error message');
                },
                responseConfig = {
                    is: 'value',
                    behaviors: [{ wait: fn.toString() }]
                },
                request = { key: 'request' };

            try {
                await resolver.resolve(responseConfig, request, logger, {});
                assert.fail('Promise resolved, should have been rejected');
            }
            catch (error) {
                assert.equal(error.message, 'invalid wait injection');
            }
        });

        it('should allow asynchronous injection', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                fn = (request, state, logger, callback) => {
                    setTimeout(() => {
                        callback('value');
                    }, 1);
                },
                responseConfig = { inject: fn },
                request = { key: 'request' };

            const response = await resolver.resolve(responseConfig, request, { debug: mock() }, {});

            assert.strictEqual(response, 'value');
        });

        it('should not be able to change state through inject', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = request => {
                    request.key = 'CHANGED';
                    return 0;
                },
                responseConfig = { inject: fn.toString() },
                request = { key: 'ORIGINAL' };

            await resolver.resolve(responseConfig, request, logger, {});

            assert.strictEqual(request.key, 'ORIGINAL');
        });

        it('should not run injection during dry run validation', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                fn = () => {
                    throw Error('BOOM!!!');
                },
                responseConfig = { inject: fn.toString() },
                request = { isDryRun: true };

            const response = await resolver.resolve(responseConfig, request, logger, {});

            assert.deepEqual(response, {});
        });

        it('should throw error if multiple response types given', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, {}),
                logger = Logger.create(),
                responseConfig = { is: 'value', proxy: { to: 'http://www.google.com' } };

            try {
                await resolver.resolve(responseConfig, {}, logger, {});
                assert.fail('should not have resolved');
            }
            catch (error) {
                assert.strictEqual(error.message, 'each response object must have only one response type');
            }
        });
    });

    describe('#resolveProxy', function () {
        function jsonResponse (response) {
            delete response.recordMatch;
            if (helpers.defined(response._proxyResponseTime)) {
                delete response._proxyResponseTime;
            }
            return response;
        }

        it('should error if called with invalid proxyResolutionKey', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create();

            try {
                await resolver.resolveProxy({ field: 'value' }, 0, logger);
                assert.fail('should have errored');
            }
            catch (error) {
                assert.deepEqual(error, {
                    code: 'no such resource',
                    message: 'invalid proxy resolution key',
                    source: 'CALLBACK-URL/0'
                });
                logger.error.assertLogged('Invalid proxy resolution key: 0');
            }
        });

        it('should save new response in front of proxy for "proxyOnce" mode', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyOnce' } },
                request = {};

            await stubs.add({ responses: [responseConfig] });
            responseConfig.stubIndex = () => Promise.resolve(0);
            const firstResponse = await resolver.resolve(responseConfig, request, logger, {});
            const proxyResolutionKey = parseInt(firstResponse.callbackURL.replace('CALLBACK-URL/', ''));
            const secondResponse = await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger),
                all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(jsonResponse(secondResponse), { data: 'RESPONSE' });
            delete responseConfig.stubIndex;
            assert.deepEqual(stubResponses, [
                [{ is: { data: 'RESPONSE' } }],
                [responseConfig]
            ]);
        });

        it('should save new response after proxy for "proxyAlways" mode', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                responseConfig = { proxy: { to: 'where', mode: 'proxyAlways' } },
                request = {};

            await stubs.add({ responses: [responseConfig] });
            responseConfig.stubIndex = () => Promise.resolve(0);
            const firstResponse = await resolver.resolve(responseConfig, request, logger, {});
            const proxyResolutionKey = parseInt(firstResponse.callbackURL.replace('CALLBACK-URL/', ''));
            const secondResponse = await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger),
                all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(jsonResponse(secondResponse), { data: 'RESPONSE' });
            delete responseConfig.stubIndex;
            assert.deepEqual(stubResponses, [
                [responseConfig],
                [{ is: { data: 'RESPONSE' } }]
            ]);
        });

        it('should run behaviors from original proxy config on proxy response before recording it', async function () {
            const decorateFunc = (request, response) => { response.data += '-DECORATED'; },
                stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = {
                    proxy: { to: 'where', mode: 'proxyOnce' },
                    behaviors: [{ decorate: decorateFunc.toString() }]
                },
                request = {};

            await stubs.add({ responses: [proxyResponse] });
            const responseConfig = await getResponseFrom(stubs),
                firstResponse = await resolver.resolve(responseConfig, request, logger, {}),
                proxyResolutionKey = parseInt(firstResponse.callbackURL.replace('CALLBACK-URL/', '')),
                secondResponse = await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger),
                all = await stubs.toJSON(),
                stubResponses = all.map(stub => proxyResponses(stub.responses));

            assert.deepEqual(jsonResponse(secondResponse), { data: 'RESPONSE-DECORATED' });
            assert.deepEqual(stubResponses, [
                [{ is: { data: 'RESPONSE-DECORATED' } }],
                [proxyResponse]
            ]);
        });

        it('should add wait behavior based on the proxy resolution time', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = { proxy: { to: 'where', mode: 'proxyOnce', addWaitBehavior: true } },
                request = {};

            await stubs.add({ responses: [proxyResponse] });
            const responseConfig = await getResponseFrom(stubs),
                response = await resolver.resolve(responseConfig, request, logger, {}),
                proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
            await delay(100);
            await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
            const all = await stubs.toJSON(),
                stubResponses = all.map(stub => stub.responses),
                wait = stubResponses[0][0].is._proxyResponseTime;

            assert.ok(wait > 90); // allow some variability
            assert.deepEqual(stubResponses, [
                [{ is: { data: 'RESPONSE', _proxyResponseTime: wait }, behaviors: [{ wait: wait }] }],
                [proxyResponse]
            ]);
        });

        it('should not resolve the same proxyResolutionKey twice', async function () {
            const stubs = createStubsRepository(),
                resolver = ResponseResolver.create(stubs, null, 'CALLBACK-URL'),
                logger = Logger.create(),
                proxyResponse = { proxy: { to: 'where' } },
                request = {};

            await stubs.add({ responses: [proxyResponse] });
            const responseConfig = await getResponseFrom(stubs),
                response = await resolver.resolve(responseConfig, request, logger, {}),
                proxyResolutionKey = parseInt(response.callbackURL.replace('CALLBACK-URL/', ''));
            await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);

            try {
                await resolver.resolveProxy({ data: 'RESPONSE' }, proxyResolutionKey, logger);
                assert.fail('should have errored');
            }
            catch (error) {
                assert.deepEqual(error, {
                    code: 'no such resource',
                    message: 'invalid proxy resolution key',
                    source: 'CALLBACK-URL/0'
                });
                logger.error.assertLogged('Invalid proxy resolution key: 0');
            }
        });
    });
});
