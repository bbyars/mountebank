'use strict';

var assert = require('assert'),
    Q = require('q'),
    api = require('./api'),
    port = api.port + 1;

function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

describe('POST /imposters', function () {

    it('should return create new imposter with consistent hypermedia', function (done) {
        var createdBody, imposterPath, requestsPath;

        api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
            createdBody = response.body;
            imposterPath = response.headers.location.replace(api.url, '');
            requestsPath = response.getLinkFor('requests');

            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(imposterPath, response.getLinkFor('self'));

            return api.get(imposterPath);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, createdBody);

            return api.get(requestsPath);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);

            return api.del(imposterPath);
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should create imposter at provided port', function (done) {
        api.post('/imposters', { protocol: 'http', port: port }).then(function () {
            return api.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

            return api.del('/imposters/' + port);
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should return 400 on invalid input', function (done) {
        api.post('/imposters', {}).then(function (response) {
            assert.strictEqual(response.statusCode, 400);

            return Q(true);
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should return 400 on port conflict', function (done) {
        api.post('/imposters', { protocol: 'http', port: api.port }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);

            return Q(true);
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should return 403 when does not have permission to bind to port', function (done) {
        api.post('/imposters', { protocol: 'http', port: 90 }).then(function (response) {
            assert.strictEqual(response.statusCode, 403);

            return Q(true);
        }).done(doneCallback(done), doneErrback(done));
    });
});
