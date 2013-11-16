'use strict';

var assert = require('assert'),
    api = require('../api'),
    ports = require('../../../src/util/ports');

describe('http imposter', function () {

    describe('GET /imposters/:id', function () {
        it('should return 404 if imposter has not been created', function (done) {
            api.get('/imposters/3535').then(function (response) {
                assert.strictEqual(response.statusCode, 404);
                done();
            }, function (error) {
                done(error);
            });
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function (done) {
        api.post('/imposters', { protocol: 'http', port: 5555 }).then(function () {
            return ports.isPortInUse(5555);
        }).then(function (isPortInUse) {
            assert.strictEqual(isPortInUse, true);
            return api.del('/imposters/5555');
        }).then(function () {
            return ports.isPortInUse(5555);
        }).then(function (isPortInUse) {
            assert.strictEqual(isPortInUse, false);
            done();
        }, function (error) {
            done(error);
        });
    });

    describe('GET /imposters/:id/requests', function () {
        it('should provide access to all requests', function (done) {
            var requestsPath;

            api.post('/imposters', { protocol: 'http', port: 6565 }).then(function (response) {
                requestsPath = response.getLinkFor('requests');
                return api.get('/first', 6565);
            }).then(function () {
                return api.get('/second', 6565);
            }).then(function () {
                return api.get(requestsPath);
            }).then(function (response) {
                var requests = response.body.requests.map(function (request) {
                    return request.path;
                });
                assert.deepEqual(requests, ['/first', '/second']);

                return api.del('/imposters/6565');
            }).then(function () {
                done();
            }, function (error) {
                done(error);
            });
        });
    });
});
