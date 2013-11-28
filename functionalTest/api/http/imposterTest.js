'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1;

describe('http imposter', function () {

    describe('GET /imposters/:id', function () {
        promiseIt('should return 404 if imposter has not been created', function () {
            return api.get('/imposters/3535').then(function (response) {
                assert.strictEqual(response.statusCode, 404);
            });
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        promiseIt('should shutdown server at that port', function () {
            return api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                return api.del(response.getLinkFor('self'));
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'Delete failed');

                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return a 200 even if the server does not exist', function () {
            return api.del('/imposters/9999').then(function (response) {
                assert.strictEqual(response.statusCode, 200);
            });
        });
    });

    describe('GET /imposters/:id/requests', function () {
        promiseIt('should provide access to all requests', function () {
            var requestsPath;

            return api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                requestsPath = response.getLinkFor('requests');
                return api.get('/first', port);
            }).then(function () {
                return api.get('/second', port);
            }).then(function () {
                return api.get(requestsPath);
            }).then(function (response) {
                var requests = response.body.requests.map(function (request) {
                    return request.path;
                });
                assert.deepEqual(requests, ['/first', '/second']);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
