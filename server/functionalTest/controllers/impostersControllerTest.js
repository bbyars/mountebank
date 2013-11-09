'use strict';

var assert = require('assert'),
    api = require('./api');

describe('impostersController', function () {
    describe('POST /imposters', function () {
        it('should return hypermedia for new imposter', function (done) {
            api.post('/imposters', {protocol: 'http', port: 5555}).then(function (response) {
                assert.strictEqual(response.statusCode, 201);
                assert.strictEqual(response.headers.location, api.url + '/imposters/5555');
                assert.deepEqual(response.body, {
                    protocol: 'http',
                    port: 5555,
                    links: [
                        { href: api.url + '/imposters/5555', rel: 'self' },
                        { href: api.url + '/imposters/5555/requests', rel: 'requests' },
                        { href: api.url + '/imposters/stubs', rel: 'stubs' }
                    ]
                });
                done();
            });
        });

        it('should create imposter at provided port');
    });
});
