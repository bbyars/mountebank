'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q');

describe('imposter', function () {
    describe('#create', function () {
        var response, Protocol;

        beforeEach(function () {
            response = {
                absoluteUrl: function (endpoint) {
                    return 'http://localhost' + endpoint;
                }
            };
            Protocol = {
                name: 'http',
                create: mock().returns(Q({ requests: [] })),
                close: mock()
            };
        });

        it('should return url', function (done) {
            Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.strictEqual(imposter.url(response), 'http://localhost/imposters/3535');
                done();
            });
        });

        it('should return hypermedia links', function (done) {
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
                done();
            });
        });

        it('should create protocol server on provided port', function (done) {
            Imposter.create(Protocol, 3535).then(function () {
                assert(Protocol.create.wasCalledWith(3535));
                done();
            });
        });
    });
});
