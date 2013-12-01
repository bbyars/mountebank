'use strict';

var assert = require('assert'),
    api = require('./api'),
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1;

describe('POST /imposters', function () {

    promiseIt('should return create new imposter with consistent hypermedia', function () {
        var createdBody, imposterPath;

        return api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
            createdBody = response.body;

            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, response.body._links.self.href);

            return api.get(response.headers.location);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, createdBody);
        }).finally(function () {
            return api.del(imposterPath);
        });
    });

    promiseIt('should create imposter at provided port', function () {
        return api.post('/imposters', { protocol: 'http', port: port }).then(function () {
            return api.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should return 400 on invalid input', function () {
        return api.post('/imposters', {}).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return 400 on port conflict', function () {
        return api.post('/imposters', { protocol: 'http', port: api.port }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return 403 when does not have permission to bind to port', function () {
        return api.post('/imposters', { protocol: 'http', port: 90 }).then(function (response) {
            assert.strictEqual(response.statusCode, 403);
        });
    });
});
