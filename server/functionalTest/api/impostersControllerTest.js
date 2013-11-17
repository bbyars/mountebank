'use strict';

var assert = require('assert'),
    api = require('./api');

function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

describe('POST /imposters', function () {

    it('should return create new imposter with consistent hypermedia', function (done) {
        var createdBody, imposterPath, requestsPath;

        api.post('/imposters', { protocol: 'http', port: 4545 }).then(function (response) {
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
        api.post('/imposters', { protocol: 'http', port: 5555 }).then(function () {
            return api.get('/', 5555);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);

            return api.del('/imposters/5555');
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should return 400 on invalid input', function (done) {
        api.post('/imposters', {}).done(function (response) {
            assert.strictEqual(response.statusCode, 400);
            done();
        }, doneErrback(done));
    });

    it('should return 400 on port conflict', function (done) {
        api.post('/imposters', { protocol: 'http', port: 6565 }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return api.post('/imposters', { protocol: 'http', port: 6565 });
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            return api.del('/imposters/6565');
        }).done(doneCallback(done), doneErrback(done));
    });

    it('should return 403 when does not have permission to bind to port', function (done) {
        api.post('/imposters', { protocol: 'http', port: 90 }).done(function (response) {
            assert.strictEqual(response.statusCode, 403);
            done();
        }, doneErrback(done));
    });
});
