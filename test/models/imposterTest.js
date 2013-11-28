'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Imposter = require('../../src/models/imposter'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

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
                create: mock().returns(Q({
                    requests: [],
                    addStub: mock()
                })),
                close: mock()
            };
        });

        promiseIt('should return url', function () {
            return Imposter.create(Protocol, 3535).then(function (imposter) {
                assert.strictEqual(imposter.url(response), 'http://localhost/imposters/3535');
            });
        });

        promiseIt('should return hypermedia links', function () {
            return Imposter.create(Protocol, 3535).then(function (imposter) {
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

        promiseIt('should create protocol server on provided port', function () {
            return Imposter.create(Protocol, 3535, true).then(function () {
                assert(Protocol.create.wasCalledWith(3535));
            });
        });

        promiseIt('should return list of stubs', function () {
            return Imposter.create(Protocol, 3535, true).then(function (imposter) {
                imposter.addStub('ONE');
                imposter.addStub('TWO');

                assert.deepEqual(imposter.stubsHypermedia(), { stubs: ['ONE', 'TWO'] });
            });
        });
    });
});
