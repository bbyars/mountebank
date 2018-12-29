'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

describe('imposter', function () {
    describe('#create', function () {
        let Protocol, metadata, server;

        beforeEach(() => {
            metadata = {};
            server = {
                requests: [],
                addStub: mock(),
                stubs: mock().returns([]),
                metadata,
                state: { foo: 'bar' },
                numberOfRequests: mock().returns(0)
            };
            Protocol = {
                name: 'http',
                create: mock().returns(Q(server)),
                close: mock()
            };
        });

        promiseIt('should return url', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.strictEqual(imposter.url, '/imposters/3535');
            });
        });

        promiseIt('should return trimmed down JSON for lists', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON({ list: true }), {
                    protocol: 'http',
                    port: 3535,
                    numberOfRequests: 0,
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should return full JSON representation by default', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'http',
                    port: 3535,
                    numberOfRequests: 0,
                    requests: [],
                    stubs: [],
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should add protocol metadata to JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'http',
                    port: 3535,
                    numberOfRequests: 0,
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

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
                    protocol: 'http',
                    port: 3535,
                    stubs: [],
                    key: 'value'
                });
            });
        });

        promiseIt('should create protocol server on provided port with options', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { key: 'value' }).then(() => {
                assert(Protocol.create.wasCalledWith({ key: 'value' }));
            });
        });

        promiseIt('should return list of stubs', function () {
            server.stubs = mock().returns([{ responses: ['FIRST'] }, { responses: ['SECOND'] }]);
            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON().stubs, [
                    { responses: ['FIRST'] },
                    { responses: ['SECOND'] }
                ]);
            });
        });

        promiseIt('replayable JSON should remove stub matches', function () {
            server.stubs = mock().returns([
                {
                    responses: ['FIRST'],
                    matches: ['MATCH']
                },
                {
                    responses: ['SECOND'],
                    matches: ['MATCH']
                }
            ]);
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
                    protocol: 'http',
                    port: 3535,
                    stubs: [{ responses: ['FIRST'] },
                        { responses: ['SECOND'] }]
                });
            });
        });

        promiseIt('replayable JSON should remove _proxyResponseTime fields', function () {
            server.stubs = mock().returns([{ responses: [{ is: { body: 'body', _proxyResponseTime: 3 } }] }]);
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(imposter => {
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
                    protocol: 'http',
                    port: 3535,
                    stubs: [{ responses: [{ is: { body: 'body' } }] }]
                });
            });
        });

        promiseIt('should remove proxies from responses if asked', function () {
            server.stubs = mock().returns([
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
            ]);
            return Imposter.create(Protocol, {}).then(imposter => {
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
            server.stubs = mock().returns([
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
            ]);
            return Imposter.create(Protocol, {}).then(imposter => {
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
