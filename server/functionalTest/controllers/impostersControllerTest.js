'use strict';

var assert = require('assert'),
    api = require('./api');

describe('impostersController', function () {
    describe('POST /imposters', function () {
        it('should return create new imposter with the consistent hypermedia', function (done) {
            api.post('/imposters', { protocol: 'http', port: 4545 }).then(function (response) {
                assert.strictEqual(response.statusCode, 201);

                var createdBody = response.body,
                    imposterUrl = response.headers.location.replace(api.url, '');

                api.get(imposterUrl).then(function (imposterResponse) {
                    assert.strictEqual(imposterResponse.statusCode, 200);
                    assert.deepEqual(imposterResponse.body, createdBody);
                    done();
                });
            });
        });

        it('should create imposter at provided port', function (done) {
            api.post('/imposters', { protocol: 'http', port: 5555 }).then(function () {
                api.get("/", 5555).then(function (imposterResponse) {
                    assert.strictEqual(imposterResponse.statusCode, 200);
                    done();
                });
            });
        });
    });
});
