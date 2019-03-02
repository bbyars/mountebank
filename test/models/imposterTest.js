'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    FakeLogger = require('../fakes/fakeLogger');

function allow () { return true; }
function deny () { return false; }

describe('imposter', function () {
    describe('#create', function () {
        let Protocol, metadata, server, logger, stubs;

        beforeEach(() => {
            metadata = {};
            stubs = [];
            server = {
                stubs: {
                    addStub: stub => { stubs.push(stub); },
                    stubs: () => stubs
                },
                resolver: mock(),
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

        promiseIt('should return trimmed down JSON for lists', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                assert.deepEqual(imposter.toJSON({ list: true }), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should not display imposter level recordRequests from the global parameter', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, { recordRequests: true }, allow).then(imposter => {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    recordRequests: false,
                    requests: [],
                    stubs: [],
                    _links: { self: { href: '/imposters/3535' } }
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
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    recordRequests: true,
                    requests: [],
                    stubs: [],
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should return full JSON representation by default', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    recordRequests: false,
                    requests: [],
                    stubs: [],
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should add protocol metadata to JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    recordRequests: false,
                    requests: [],
                    stubs: [],
                    key: 'value',
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should provide replayable JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, { protocol: 'test' }, logger, {}, allow).then(imposter => {
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
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
                assert.deepEqual(imposter.toJSON().stubs, [
                    { responses: ['FIRST'] },
                    { responses: ['SECOND'] }
                ]);
            });
        });

        promiseIt('replayable JSON should remove stub matches', function () {
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
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
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
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
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
                assert.deepEqual(imposter.toJSON({ removeProxies: true }).stubs, [
                    {
                        responses: [
                            { is: { body: 'first' } },
                            { inject: 'inject' }
                        ]
                    },
                    {
                        responses: [
                            { is: { body: 'second' } }
                        ]
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
                assert.deepEqual(imposter.toJSON({ removeProxies: true }).stubs, [
                    {
                        responses: [
                            { is: { body: 'first' } },
                            { inject: 'inject' }
                        ]
                    }
                ]);
            });
        });

        promiseIt('responseFor should resolve using stubs and resolver', function () {
            server.stubs.getResponseFor = mock().returns('RESPONSE CONFIG');
            server.resolver.resolve = mock().returns(Q({ is: 'RESPONSE' }));

            return Imposter.create(Protocol, {}, logger, {}, allow).then(imposter =>
                imposter.getResponseFor({})
            ).then(response => {
                assert.deepEqual(response, { is: 'RESPONSE' });
            });
        });

        promiseIt('responseFor should increment numberOfRequests and not record requests if recordRequests = false', function () {
            server.stubs.getResponseFor = mock().returns('RESPONSE CONFIG');
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: false }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({});
            }).then(() => {
                const json = imposter.toJSON();
                assert.strictEqual(json.numberOfRequests, 1);
                assert.deepEqual(json.requests, []);
            });
        });

        promiseIt('responseFor should increment numberOfRequests and record requests if imposter recordRequests = true', function () {
            server.stubs.getResponseFor = mock().returns('RESPONSE CONFIG');
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: true }, logger, { recordRequests: false }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                const json = imposter.toJSON();

                assert.strictEqual(json.numberOfRequests, 1);
                assert.strictEqual(json.requests.length, 1);
            });
        });

        promiseIt('responseFor should increment numberOfRequests and record requests if global recordRequests = true', function () {
            server.stubs.getResponseFor = mock().returns('RESPONSE');
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, { recordRequests: false }, logger, { recordRequests: true }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                const json = imposter.toJSON();

                assert.strictEqual(json.numberOfRequests, 1);
                assert.strictEqual(json.requests.length, 1);
            });
        });

        promiseIt('responseFor should add timestamp to recorded request', function () {
            server.stubs.getResponseFor = mock().returns('RESPONSE');
            server.resolver.resolve = mock().returns(Q({}));
            let imposter;

            return Imposter.create(Protocol, {}, logger, { recordRequests: true }, allow).then(imp => {
                imposter = imp;
                return imposter.getResponseFor({ request: 1 });
            }).then(() => {
                const json = imposter.toJSON();

                assert.deepEqual(Object.keys(json.requests[0]).sort(), ['request', 'timestamp']);
                assert.strictEqual(json.requests[0].request, 1);
            });
        });

        promiseIt('responseFor should return error if ip check denied', function () {
            return Imposter.create(Protocol, {}, logger, {}, deny).then(imposter =>
                imposter.getResponseFor({})
            ).then(response => {
                assert.deepEqual(response, { blocked: true, code: 'unauthorized ip address' });
            });
        });
    });
});
