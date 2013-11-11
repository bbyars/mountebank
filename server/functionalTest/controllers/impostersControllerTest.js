'use strict';

var assert = require('assert'),
    api = require('./api');

function getLinkFor (rel, body) {
    return body.links.filter(function (link) {
        return link.rel === rel;
    })[0].href.replace(api.url, '');
}

describe('POST /imposters', function () {

    it('should return create new imposter with consistent hypermedia', function (done) {
        var createdBody, imposterUrl;

        api.post('/imposters', { protocol: 'http', port: 4545 }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);

            createdBody = response.body;
            imposterUrl = response.headers.location.replace(api.url, '');
            assert.strictEqual(imposterUrl, getLinkFor('self', response.body));
            return api.get(imposterUrl);
        }).then(function (imposterResponse) {
            assert.strictEqual(imposterResponse.statusCode, 200);
            assert.deepEqual(imposterResponse.body, createdBody);

            return api.del(imposterUrl);
        }).then(function () {
            done();
        });
    });

    it('should create imposter at provided port', function (done) {
        api.post('/imposters', { protocol: 'http', port: 5555 }).then(function () {
            return api.get('/', 5555);
        }).then(function (imposterResponse) {
            assert.strictEqual(imposterResponse.statusCode, 200);

            return api.del('/imposters/5555');
        }).then(function () {
            done();
        });
    });

    it('should provide hypermedia to access requests', function (done) {
        var requestsPath;

        api.post('/imposters', { protocol: 'http', port: 6565 }).then(function (response) {
            requestsPath = getLinkFor('requests', response.body);
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
        });
    });
});
