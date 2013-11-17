'use strict';

var assert = require('assert'),
    api = require('../api');


function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

describe('http imposter', function () {

    describe('GET /imposters/:id', function () {
        it('should return 404 if imposter has not been created', function (done) {
            api.get('/imposters/3535').done(function (response) {
                assert.strictEqual(response.statusCode, 404);
                done();
            }, doneErrback(done));
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        it('should shutdown server at that port', function (done) {
            api.post('/imposters', { protocol: 'http', port: 5555 }).then(function () {
                return api.del('/imposters/5555');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'Delete failed');

                return api.post('/imposters', { protocol: 'http', port: 5555 });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');

                return api.del('/imposters/5555');
            }).done(doneCallback(done), doneErrback(done));
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
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('POST /imposters/:id/stubs', function () {
        it('should return stubbed response', function (done) {
            api.post('/imposters', { protocol: 'http', port: 5555 }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
                        path: '/test',
                        responses: [{
                            statusCode: 400,
                            headers: { 'X-Test': 'test header' },
                            body: 'test body'
                        }]
                    };

                return api.post(stubsPath, stubBody);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);

                return api.get('/test', 5555);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'test body');
                assert.strictEqual(response.headers['x-test'], 'test header');

                return api.del('/imposters/5555');
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow a sequence of stubs as a circular buffer', function (done) {
            api.post('/imposters', { protocol: 'http', port: 6565 }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
                        path: '/test',
                        responses: [{ statusCode: 400 }, { statusCode: 405 }]
                    };

                return api.post(stubsPath, stubBody);
            }).then(function () {
                return api.get('/test', 6565);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);

                return api.get('/test', 6565);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 405);

                return api.get('/test', 6565);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);

                return api.get('/test', 6565);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 405);

                return api.del('/imposters/6565');
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should only return stubbed response if matches header');
        it('should only return stubbed response if matches body');
        it('should only return stubbed response if matches method');
        it('should allow javascript injection');
    });
});
