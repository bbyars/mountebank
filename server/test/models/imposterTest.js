'use strict';

var assert = require('assert'),
    Imposter = require('../../src/models/imposter');

describe('imposter#create', function () {

    describe('#hypermedia', function () {
        it('should return hypermedia links', function () {
            var imposter = Imposter.create('http', 8000),
                response = {
                    absoluteUrl: function (endpoint, port) {
                        return 'http://localhost' + endpoint;
                    }
                };

            assert.deepEqual(imposter.hypermedia(response), {
                 protocol: 'http',
                 port: 8000,
                 links: [
                     { href: 'http://localhost/servers/8000', rel: 'self' },
                     { href: 'http://localhost/servers/8000/requests', rel: 'requests' },
                     { href: 'http://localhost/servers/8000/stubs', rel: 'stubs' }
                 ]
             });
        });
    });
});
