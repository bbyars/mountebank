'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    mockery = require('mockery'),
    fakeQ = require('../fakes/fakeQ');

describe('imposter', function () {
    describe('#create', function () {
        var response, Protocol, Imposter;

        beforeEach(function () {
            response = {
                absoluteUrl: function (endpoint) {
                    return 'http://localhost' + endpoint;
                }
            };
            Protocol = {
                name: 'http',
                create: mock().returns({
                    then: function (fn) { fn(); }
                })
            };
            mockery.enable({
                useCleanCache: true,
                warnOnUnregistered: false,
                warnOnReplace: false
            });
            mockery.registerMock('q', fakeQ);
            Imposter = require('../../src/models/imposter');
        });

        afterEach(function () {
            mockery.disable();
        });

        it('should return url', function () {
            Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.strictEqual(imposter.url(response), 'http://localhost/imposters/3535');
            });
        });

        it('should return hypermedia links', function () {
            Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.deepEqual(imposter.hypermedia(response), {
                    protocol: 'http',
                    port: 3535,
                    links: [
                        { href: 'http://localhost/imposters/3535', rel: 'self' },
                        { href: 'http://localhost/imposters/3535/requests', rel: 'requests' },
                        { href: 'http://localhost/imposters/3535/stubs', rel: 'stubs' }
                    ]
                });
            });
        });

        it('should create protocol server on provided port', function () {
            Imposter.create(Protocol, 3535).then(function () {
                assert(Protocol.create.wasCalledWith(3535));
            });
        });
    });
});
