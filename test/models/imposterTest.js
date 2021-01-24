'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    FakeLogger = require('../fakes/fakeLogger'),
    createStubRepository = require('../../src/models/inMemoryImpostersRepository').create().createStubsRepository;

function allow () { return true; }
function deny () { return false; }

describe('imposter', function () {
    let Protocol, metadata, server, logger;

    beforeEach(function () {
        metadata = {};
        server = {
            stubs: createStubRepository(),
            resolver: { resolve: mock().returns(Promise.resolve({})) },
            port: 3535,
            metadata: metadata,
            close: mock(),
            proxy: { to: mock() },
            encoding: 'utf8'
        };
        Protocol = {
            testRequest: {},
            testProxyResponse: {},
            createServer: mock().returns(Promise.resolve(server))
        };
        logger = FakeLogger.create();
    });

    it('should return url', async function () {
        server.port = 3535;

        const imposter = await Imposter.create(Protocol, {}, logger, {}, allow);

        assert.strictEqual(imposter.url, '/imposters/3535');
    });

    describe('#toJSON', function () {
        it('should return trimmed down JSON for lists', async function () {
            server.port = 3535;

            const imposter = await Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow),
                json = await imposter.toJSON({ list: true });

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                numberOfRequests: 0,
                _links: {
                    self: { href: '/imposters/3535' },
                    stubs: { href: '/imposters/3535/stubs' }
                }
            });
        });

        it('should not display imposter level recordRequests from the global parameter', async function () {
            server.port = 3535;

            const imposter = await Imposter.create(Protocol, { protocol: 'test' }, logger, { recordRequests: true }, allow),
                json = await imposter.toJSON();

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                numberOfRequests: 0,
                recordRequests: false,
                requests: [],
                stubs: [],
                _links: {
                    self: { href: '/imposters/3535' },
                    stubs: { href: '/imposters/3535/stubs' }
                }
            });
        });

        it('imposter-specific recordRequests should override global parameter', async function () {
            const request = {
                protocol: 'test',
                port: 3535,
                recordRequests: true
            };

            const imposter = await Imposter.create(Protocol, request, logger, { recordRequests: false }, allow),
                json = await imposter.toJSON();

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                numberOfRequests: 0,
                recordRequests: true,
                requests: [],
                stubs: [],
                _links: {
                    self: { href: '/imposters/3535' },
                    stubs: { href: '/imposters/3535/stubs' }
                }
            });
        });

        it('should return full JSON representation by default', async function () {
            server.port = 3535;

            const imposter = await Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow),
                json = await imposter.toJSON();

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                numberOfRequests: 0,
                recordRequests: false,
                requests: [],
                stubs: [],
                _links: {
                    self: { href: '/imposters/3535' },
                    stubs: { href: '/imposters/3535/stubs' }
                }
            });
        });

        it('should add protocol metadata to JSON representation', async function () {
            server.port = 3535;
            metadata.key = 'value';

            const imposter = await Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow),
                json = await imposter.toJSON();

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                numberOfRequests: 0,
                recordRequests: false,
                requests: [],
                stubs: [],
                key: 'value',
                _links: {
                    self: { href: '/imposters/3535' },
                    stubs: { href: '/imposters/3535/stubs' }
                }
            });
        });

        it('should provide replayable JSON representation', async function () {
            server.port = 3535;
            metadata.key = 'value';

            const imposter = await Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow),
                json = await imposter.toJSON({ replayable: true });

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                recordRequests: false,
                stubs: [],
                key: 'value'
            });
        });

        it('should create protocol server on provided port with options', async function () {
            await Imposter.create(Protocol, { key: 'value' }, logger, {}, allow);

            assert(Protocol.createServer.wasCalledWith({ key: 'value', port: 3535 }), Protocol.createServer.message());
        });

        it('should return list of stubs', async function () {
            const request = {
                    stubs: [{ responses: ['FIRST'] }, { responses: ['SECOND'] }]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await server.stubs.add(request.stubs[1]);
            const json = await imposter.toJSON();

            assert.deepEqual(json.stubs, [
                {
                    responses: ['FIRST'],
                    _links: { self: { href: '/imposters/3535/stubs/0' } }
                },
                {
                    responses: ['SECOND'],
                    _links: { self: { href: '/imposters/3535/stubs/1' } }
                }
            ]);
        });

        it('replayable JSON should remove stub matches and links', async function () {
            const request = {
                protocol: 'test',
                port: 3535,
                stubs: [
                    {
                        responses: ['FIRST'],
                        matches: ['MATCH']
                    },
                    {
                        responses: ['SECOND'],
                        matches: ['MATCH']
                    }
                ]
            };

            const imposter = await Imposter.create(Protocol, request, logger, {}, allow);
            await server.stubs.add(request.stubs[0]);
            await server.stubs.add(request.stubs[1]);
            const json = await imposter.toJSON({ replayable: true });

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                recordRequests: false,
                stubs: [{ responses: ['FIRST'] },
                    { responses: ['SECOND'] }]
            });
        });

        it('replayable JSON should remove _proxyResponseTime fields', async function () {
            const request = {
                    protocol: 'test',
                    port: 3535,
                    stubs: [{ responses: [{ is: { body: 'body', _proxyResponseTime: 3 } }] }]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            const json = await imposter.toJSON({ replayable: true });

            assert.deepEqual(json, {
                protocol: 'test',
                port: 3535,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'body' } }] }]
            });
        });

        it('should remove proxies from responses if asked', async function () {
            const request = {
                    stubs: [
                        {
                            responses: [
                                { proxy: { to: 'http://localhost:3000' } },
                                { is: { body: 'first' } },
                                { inject: 'inject' }
                            ]
                        },
                        {
                            responses: [
                                { is: { body: 'second' } }
                            ]
                        }
                    ]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await server.stubs.add(request.stubs[1]);
            const json = await imposter.toJSON({ removeProxies: true });


            assert.deepEqual(json.stubs, [
                {
                    responses: [
                        { is: { body: 'first' } },
                        { inject: 'inject' }
                    ],
                    _links: { self: { href: '/imposters/3535/stubs/0' } }
                },
                {
                    responses: [
                        { is: { body: 'second' } }
                    ],
                    _links: { self: { href: '/imposters/3535/stubs/1' } }
                }
            ]);
        });

        it('should remove empty stubs after proxy removal', async function () {
            const request = {
                    stubs: [
                        {
                            responses: [
                                { proxy: { to: 'http://localhost:3000' } },
                                { is: { body: 'first' } },
                                { inject: 'inject' }
                            ]
                        },
                        {
                            responses: [
                                { proxy: { to: 'http://localhost:3001' } }
                            ]
                        }
                    ]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await server.stubs.add(request.stubs[1]);
            const json = await imposter.toJSON({ removeProxies: true });

            assert.deepEqual(json.stubs, [
                {
                    responses: [
                        { is: { body: 'first' } },
                        { inject: 'inject' }
                    ],
                    _links: { self: { href: '/imposters/3535/stubs/0' } }
                }
            ]);
        });

        it('responseFor should increment numberOfRequests and not record requests if recordRequests = false', async function () {
            server.resolver.resolve = mock().returns(Promise.resolve({}));
            const imposter = await Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: false }, allow);

            await imposter.getResponseFor({});
            const json = await imposter.toJSON();

            assert.strictEqual(json.numberOfRequests, 1);
            assert.deepEqual(json.requests, []);
        });

        it('responseFor should increment numberOfRequests and record requests if imposter recordRequests = true', async function () {
            server.resolver.resolve = mock().returns(Promise.resolve({}));

            const imposter = await Imposter.create(Protocol, { recordRequests: true }, logger, { recordRequests: false }, allow);
            await imposter.getResponseFor({ request: 1 });
            const json = await imposter.toJSON();

            assert.strictEqual(json.numberOfRequests, 1);
            assert.strictEqual(json.requests.length, 1);
        });

        it('responseFor should increment numberOfRequests and record requests if global recordRequests = true', async function () {
            server.resolver.resolve = mock().returns(Promise.resolve({}));
            const imposter = await Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: true }, allow);

            await imposter.getResponseFor({ request: 1 });
            const json = await imposter.toJSON();

            assert.strictEqual(json.numberOfRequests, 1);
            assert.strictEqual(json.requests.length, 1);
        });

        it('responseFor should add timestamp to recorded request', async function () {
            server.resolver.resolve = mock().returns(Promise.resolve({}));
            const imposter = await Imposter.create(Protocol, {}, logger, { recordRequests: true }, allow);

            await imposter.getResponseFor({ request: 1 });
            const json = await imposter.toJSON();

            assert.deepEqual(Object.keys(json.requests[0]).sort(), ['request', 'timestamp']);
            assert.strictEqual(json.requests[0].request, 1);
        });
    });

    describe('#getResponseFor', function () {
        it('responseFor should return error if ip check denied', async function () {
            const imposter = await Imposter.create(Protocol, {}, logger, {}, deny),
                response = await imposter.getResponseFor({});

            assert.deepEqual(response, { blocked: true, code: 'unauthorized ip address' });
        });

        it('should return default response if no match', async function () {
            const imposter = await Imposter.create(Protocol, {}, logger, {}, allow);

            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith({ is: {} }), server.resolver.resolve.message());
        });

        it('should always match if no predicate', async function () {
            const request = {
                    stubs: [{ responses: [{ is: 'first stub' }] }]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await imposter.getResponseFor({ field: 'value' });

            assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first stub' }), server.resolver.resolve.message());
        });

        it('should return first match', async function () {
            const request = {
                    stubs: [
                        { predicates: [{ equals: { field: '1' } }], responses: [{ is: 'first stub' }] },
                        { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'second stub' }] },
                        { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'third stub' }] }
                    ]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await server.stubs.add(request.stubs[1]);
            await server.stubs.add(request.stubs[2]);
            await imposter.getResponseFor({ field: '2' });

            assert.ok(server.resolver.resolve.wasCalledWith({ is: 'second stub' }), server.resolver.resolve.message());
        });

        it('should return responses in order, looping around', async function () {
            const request = {
                    stubs: [{ responses: [{ is: 'first response' }, { is: 'second response' }] }]
                },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first response' }), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith({ is: 'second response' }), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first response' }), server.resolver.resolve.message());
        });

        it('should repeat a response and continue looping', async function () {
            const firstResponse = { is: 'first response', repeat: 2 },
                secondResponse = { is: 'second response' },
                request = { stubs: [{ responses: [firstResponse, secondResponse] }] },
                imposter = await Imposter.create(Protocol, request, logger, {}, allow);

            await server.stubs.add(request.stubs[0]);
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(secondResponse), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
            await imposter.getResponseFor({});

            assert.ok(server.resolver.resolve.wasCalledWith(secondResponse), server.resolver.resolve.message());
        });
    });

    describe('#resetRequests', function () {
        it('should delete requests and reset numberOfRequests', async function () {
            const imposter = await Imposter.create(Protocol, {}, logger, { recordRequests: true }, allow);

            await imposter.getResponseFor({});
            const requests = await server.stubs.loadRequests();

            assert.strictEqual(1, requests.length);
            const json = await imposter.toJSON();

            assert.strictEqual(1, json.numberOfRequests);
            await imposter.resetRequests();

            const secondRequests = await server.stubs.loadRequests();
            assert.strictEqual(0, secondRequests.length);
            const secondJSON = await imposter.toJSON();
            assert.strictEqual(0, secondJSON.numberOfRequests);
        });
    });
});
