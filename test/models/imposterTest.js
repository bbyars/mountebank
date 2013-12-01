'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

describe('imposter', function () {
    describe('#create', function () {
        var Protocol;

        beforeEach(function () {
            Protocol = {
                name: 'http',
                create: mock().returns(Q({
                    requests: [],
                    addStub: mock()
                })),
                close: mock()
            };
        });

        promiseIt('should return url', function () {
            return Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.strictEqual(imposter.url, '/imposters/3535');
            });
        });

        promiseIt('should return default JSON representation', function () {
            return Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.deepEqual(imposter.toJSON(), {
                    protocol: 'http',
                    port: 3535,
                    requests: [],
                    stubs: [],
                    links: [{ href: '/imposters/3535', rel: 'self' }]
                });
            });
        });

        promiseIt('should create protocol server on provided port', function () {
            return Imposter.create(Protocol, 3535, true).then(function () {
                assert(Protocol.create.wasCalledWith(3535));
            });
        });

        promiseIt('should return list of stubs', function () {
            return Imposter.create(Protocol, 3535, true).then(function (imposter) {
                imposter.addStub('ONE');
                imposter.addStub('TWO');

                assert.deepEqual(imposter.toJSON().stubs, ['ONE', 'TWO']);
            });
        });

        promiseIt('should add stubs during creation', function () {
            var request = { stubs: ['ONE', 'TWO'] };

            return Imposter.create(Protocol, 3535, true, request).then(function (imposter) {
                assert.deepEqual(imposter.toJSON().stubs, ['ONE', 'TWO']);
            });
        });
    });
});
