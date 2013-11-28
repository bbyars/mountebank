'use strict';

var assert = require('assert'),
    api = require('../api'),
    Q = require('q'),
    port = api.port + 1;

function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

describe('http imposter', function () {

    afterEach(function (done) {
        api.del('/imposters/' + port).done(doneCallback(done), done);
    });

    describe('GET /imposters/:id', function () {
        it('should return 404 if imposter has not been created', function (done) {
            api.get('/imposters/3535').then(function (response) {
                assert.strictEqual(response.statusCode, 404);

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        it('should shutdown server at that port', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                return api.del(response.getLinkFor('self'));
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'Delete failed');

                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should return a 200 even if the server does not exist', function (done) {
            api.del('/imposters/9999').then(function (response) {
                assert.strictEqual(response.statusCode, 200);

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('GET /imposters/:id/requests', function () {
        it('should provide access to all requests', function (done) {
            var requestsPath;

            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
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

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });
});
