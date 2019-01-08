'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    FakeLogger = require('../fakes/fakeLogger');

describe('imposter', function () {
    describe('#create', function () {
        let Protocol, metadata, server, logger;

        beforeEach(() => {
            metadata = {};
            server = {
                port: 3535,
                metadata: metadata,
                close: mock(),
                postProcess: response => response,
                proxy: { to: mock() },
                encoding: 'utf8'
            };
            Protocol = {
                testRequest: {},
                testProxyResponse: {},
                create: mock().returns(Q(server))
            };
            logger = FakeLogger.create();
        });

        promiseIt('should return url', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}, logger, false, false).then(imposter => {
                assert.strictEqual(imposter.url, '/imposters/3535');
            });
        });

        promiseIt('should return trimmed down JSON for lists', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, false, false).then(imposter => {
                assert.deepEqual(imposter.toJSON({ list: true }), {
                    protocol: 'test',
                    port: 3535,
                    numberOfRequests: 0,
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should return recordRequests from global parameter', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, false, true).then(imposter => {
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

        promiseIt('imposter-specific recordRequests should override global parameter', function () {
            const request = {
                protocol: 'test',
                port: 3535,
                recordRequests: false
            };

            return Imposter.create(Protocol, request, logger, false, true).then(imposter => {
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

        promiseIt('should return full JSON representation by default', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { protocol: 'test' }, logger, false, false).then(imposter => {
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

            return Imposter.create(Protocol, { protocol: 'test' }, logger, false, false).then(imposter => {
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

            return Imposter.create(Protocol, { protocol: 'test' }, logger, false, false).then(imposter => {
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
            return Imposter.create(Protocol, { key: 'value' }, logger, false, false).then(() => {
                assert(Protocol.create.wasCalledWith({ key: 'value' }));
            });
        });

        promiseIt('should return list of stubs', function () {
            const request = {
                stubs: [{ responses: ['FIRST'] }, { responses: ['SECOND'] }]
            };
            return Imposter.create(Protocol, request, logger, false, false).then(imposter => {
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

            return Imposter.create(Protocol, request, logger, false, false).then(imposter => {
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

            return Imposter.create(Protocol, request, logger, false, false).then(imposter => {
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
            return Imposter.create(Protocol, request, logger, false, false).then(imposter => {
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

            return Imposter.create(Protocol, request, logger, false, false).then(imposter => {
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
    });
});
