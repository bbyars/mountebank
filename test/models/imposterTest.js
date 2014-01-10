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
                assert.deepEqual(imposter.toListJSON(), {
                    protocol: 'http',
                    port: 3535,
                    _links: { self: { href: '/imposters/3535' } }
                });
            });
        });

        promiseIt('should return default JSON representation', function () {
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

        promiseIt('should create protocol server on provided port with options', function () {
            server.port = 3535;

            return Imposter.create(Protocol, { key: 'value' }).then(function () {
                assert(Protocol.create.wasCalledWith({ key: 'value' }));
            });
        });

        promiseIt('should return list of stubs', function () {
            return Imposter.create(Protocol, {}).then(function (imposter) {
                imposter.addStub('ONE');
                imposter.addStub('TWO');

                assert.deepEqual(imposter.toJSON().stubs, ['ONE', 'TWO']);
            });
        });

        promiseIt('should add stubs during creation', function () {
            var request = { stubs: ['ONE', 'TWO'] };

            return Imposter.create(Protocol, request).then(function (imposter) {
                assert.deepEqual(imposter.toJSON().stubs, ['ONE', 'TWO']);
            });
        });
    });
});
