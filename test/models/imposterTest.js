'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    FakeLogger = require('../fakes/fakeLogger'),
    StubRepository = require('../../src/models/inMemoryStubRepository');

function allow () { return true; }
function deny () { return false; }

describe('imposter', function () {
    let Protocol, metadata, server, logger;

    beforeEach(() => {
        metadata = {};
        server = {
            stubs: StubRepository.create(),
            resolver: { resolve: mock().returns(Q({})) },
            port: 3535,
            metadata: metadata,
            close: mock(),
            proxy: { to: mock() },
            encoding: 'utf8'
        };
        Protocol = {
            testRequest: {},
            testProxyResponse: {},
            createServer: mock().returns(Q(server))
        };
        logger = FakeLogger.create();
    });

    promiseIt('should return url', function () {
        server.port = 3535;

        return Imposter.create(Protocol, {}, logger, {}, allow).then(imposter => {
            assert.strictEqual(imposter.url, '/imposters/3535');
        });
    });

    describe('#toJSON', function () {
        promiseIt('should return trimmed down JSON for lists', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ list: true });
            }).then(json => {
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
        });

        promiseIt('should not display imposter level recordRequests from the global parameter', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, { recordRequests: true }, allow).then(imposter => {
                return imposter.toJSON();
            }).then(json => {
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
        });

        promiseIt('imposter-specific recordRequests should override global parameter', function () {
            const request = {
                protocol: 'test',
                port: 3535,
                recordRequests: true
            };

            return Imposter.create(Protocol, request, logger, { recordRequests: false }, allow).then(imposter => {
                return imposter.toJSON();
            }).then(json => {
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
        });

        promiseIt('should return full JSON representation by default', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                return imposter.toJSON();
            }).then(json => {
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
        });

        promiseIt('should add protocol metadata to JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                return imposter.toJSON();
            }).then(json => {
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
        });

        promiseIt('should provide replayable JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ replayable: true });
            }).then(json => {
                assert.deepEqual(json, {
                    protocol: 'test',
                    port: 3535,
                    recordRequests: false,
                    stubs: [],
                    key: 'value'
                });
            });
        });

        promiseIt('should create protocol server on provided port with options', function () {
            return Imposter.create(Protocol, { key: 'value' }, logger, {}, allow).then(() => {
                assert(Protocol.createServer.wasCalledWith({ key: 'value' }));
            });
        });

        promiseIt('should return list of stubs', function () {
            const request = {
                stubs: [{ responses: ['FIRST'] }, { responses: ['SECOND'] }]
            };
            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter => {
                return imposter.toJSON();
            }).then(json => {
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
        });

        promiseIt('replayable JSON should remove stub matches and links', function () {
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

            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ replayable: true });
            }).then(json => {
                assert.deepEqual(json, {
                    protocol: 'test',
                    port: 3535,
                    recordRequests: false,
                    stubs: [{ responses: ['FIRST'] },
                        { responses: ['SECOND'] }]
                });
            });
        });

        promiseIt('replayable JSON should remove _proxyResponseTime fields', function () {
            const request = {
                protocol: 'test',
                port: 3535,
                stubs: [{ responses: [{ is: { body: 'body', _proxyResponseTime: 3 } }] }]
            };

            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ replayable: true });
            }).then(json => {
                assert.deepEqual(json, {
                    protocol: 'test',
                    port: 3535,
                    recordRequests: false,
                    stubs: [{ responses: [{ is: { body: 'body' } }] }]
                });
            });
        });

        promiseIt('should remove proxies from responses if asked', function () {
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
            };
            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ removeProxies: true });
            }).then(json => {
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
        });

        promiseIt('should remove empty stubs after proxy removal', function () {
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
            };

            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter => {
                return imposter.toJSON({ removeProxies: true });
            }).then(json => {
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
        });

        promiseIt('responseFor should increment numberOfRequests and not record requests if recordRequests = false', function () {
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: false }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({});
            }).then(() => {
                return imposter.toJSON();
            }).then(json => {
                assert.strictEqual(json.numberOfRequests, 1);
                assert.deepEqual(json.requests, []);
            });
        });

        promiseIt('responseFor should increment numberOfRequests and record requests if imposter recordRequests = true', function () {
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: true }, logger, { recordRequests: false }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                return imposter.toJSON();
            }).then(json => {
                assert.strictEqual(json.numberOfRequests, 1);
                assert.strictEqual(json.requests.length, 1);
            });
        });

        promiseIt('responseFor should increment numberOfRequests and record requests if global recordRequests = true', function () {
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: true }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                return imposter.toJSON();
            }).then(json => {
                assert.strictEqual(json.numberOfRequests, 1);
                assert.strictEqual(json.requests.length, 1);
            });
        });

        promiseIt('responseFor should add timestamp to recorded request', function () {
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, {}, logger, { recordRequests: true }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                return imposter.toJSON();
            }).then(json => {
                assert.deepEqual(Object.keys(json.requests[0]).sort(), ['request', 'timestamp']);
                assert.strictEqual(json.requests[0].request, 1);
            });
        });
    });

    describe('#getResponseFor', function () {
        promiseIt('responseFor should return error if ip check denied', function () {
            return Imposter.create(Protocol, {}, logger, {}, deny).then(imposter =>
                imposter.getResponseFor({})
            ).then(response => {
                assert.deepEqual(response, { blocked: true, code: 'unauthorized ip address' });
            });
        });

        promiseIt('should return default response if no match', function () {
            return Imposter.create(Protocol, {}, logger, {}, allow).then(imposter =>
                imposter.getResponseFor({})
            ).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: {} }), server.resolver.resolve.message());
            });
        });

        promiseIt('should always match if no predicate', function () {
            const request = {
                stubs: [{ responses: [{ is: 'first stub' }] }]
            };

            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter =>
                imposter.getResponseFor({ field: 'value' })
            ).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first stub' }), server.resolver.resolve.message());
            });
        });

        promiseIt('should return first match', function () {
            const request = {
                stubs: [
                    { predicates: [{ equals: { field: '1' } }], responses: [{ is: 'first stub' }] },
                    { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'second stub' }] },
                    { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'third stub' }] }
                ]
            };

            return Imposter.create(Protocol, request, logger, {}, allow).then(imposter =>
                imposter.getResponseFor({ field: '2' })
            ).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: 'second stub' }), server.resolver.resolve.message());
            });
        });

        promiseIt('should return responses in order, looping around', function () {
            const request = {
                stubs: [{ responses: [{ is: 'first response' }, { is: 'second response' }] }]
            };
            let imposter;

            return Imposter.create(Protocol, request, logger, {}, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first response' }), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: 'second response' }), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith({ is: 'first response' }), server.resolver.resolve.message());
            });
        });

        promiseIt('should repeat a response and continue looping', function () {
            const firstResponse = { is: 'first response', _behaviors: { repeat: 2 } },
                secondResponse = { is: 'second response' },
                request = { stubs: [{ responses: [firstResponse, secondResponse] }] };
            let imposter;

            return Imposter.create(Protocol, request, logger, {}, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(secondResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(firstResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            }).then(() => {
                assert.ok(server.resolver.resolve.wasCalledWith(secondResponse), server.resolver.resolve.message());
                return imposter.getResponseFor({});
            });
        });
    });
});
