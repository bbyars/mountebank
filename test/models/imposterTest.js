'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

describe('imposter', function () {
    describe('#create', function () {
        var Protocol, metadata, server;

        beforeEach(function () {
            metadata = {};
            server = {
                requests: [],
                addStub: mock(),
                stubs: [],
                metadata: metadata
            };
            Protocol = {
                name: 'http',
                create: mock().returns(Q(server)),
                close: mock()
            };
        });

        promiseIt('should return url', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.strictEqual(imposter.url, '/imposters/3535');
            });
        });

        promiseIt('should return trimmed down JSON for lists', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON({ list: true }), {
                    protocol: 'http',
                    port: 3535,
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should return full JSON representation by default', function () {
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'http',
                    port: 3535,
                    requests: [],
                    stubs: [],
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should add protocol metadata to JSON representation', function () {
            server.port = 3535;
            metadata.key = 'value';

            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'http',
                    port: 3535,
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

            return Imposter.create(Protocol, {}).then(function (imposter) {
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

            return Imposter.create(Protocol, { key: 'value' }).then(function () {
                assert(Protocol.create.wasCalledWith({ key: 'value' }));
            });
        });

        promiseIt('should return list of stubs', function () {
            server.stubs = ['ONE', 'TWO'];
            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON().stubs, ['ONE', 'TWO']);
            });
        });

        promiseIt('replayable JSON should remove stub matches', function () {
            server.stubs = [
                {
                    responses: ['FIRST'],
                    matches: ['MATCH']
                },
                {
                    responses: ['SECOND'],
                    matches: ['MATCH']
                }
            ];
            server.port = 3535;

            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON({ replayable: true }), {
                    protocol: 'http',
                    port: 3535,
                    stubs: [{ responses: ['FIRST'] }, { responses: ['SECOND'] }]
                });
            });
        });

        promiseIt('should remove proxies from responses if asked', function () {
            server.stubs = [
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
            ];
            return Imposter.create(Protocol, {}).then(function (imposter) {
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
            server.stubs = [
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
            ];
            return Imposter.create(Protocol, {}).then(function (imposter) {
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

        promiseIt('does not mutate servers stub representation for replayable removeProxies requests', function () {
            server.stubs = [
                {
                    responses: [
                        { proxy: { to: 'http://localhost:3000' } },
                        { is: { body: 'first' } },
                        { inject: 'inject' }
                    ],
                    matches: ['MATCH']
                }
            ];
            return Imposter.create(Protocol, {}).then(function (imposter) {
                assert.deepEqual(imposter.toJSON({ removeProxies: true, replayable: true }).stubs, [
                    {
                        responses: [
                            { is: { body: 'first' } },
                            { inject: 'inject' }
                        ]
                    }
                ]);
                assert.deepEqual(server.stubs, [
                    {
                        responses: [
                            { proxy: { to: 'http://localhost:3000' } },
                            { is: { body: 'first' } },
                            { inject: 'inject' }
                        ],
                        matches: ['MATCH']
                    }
                ]);
            });
        });
    });
});
