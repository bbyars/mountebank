'use strict';

var assert = require('assert'),
    api = require('./api'),
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    client = require('./http/baseHttpClient').create('http');

describe('POST /imposters', function () {

    promiseIt('should return create new imposter with consistent hypermedia', function () {
        var createdBody, imposterPath;

        return api.post('/imposters', { protocol: 'http', port: port, name: this.name }).then(function (response) {
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
        return api.post('/imposters', { protocol: 'http', port: port, name: this.name }).then(function () {
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
        return api.post('/imposters', { protocol: 'http', port: api.port, name: this.name }).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return 403 when does not have permission to bind to port', function () {
        return api.post('/imposters', { protocol: 'http', port: 90, name: this.name }).then(function (response) {
            assert.strictEqual(response.statusCode, 403);
        });
    });
});


describe('DELETE /imposters', function () {
    promiseIt('returns 200 with empty array if no imposters had been created', function () {
        return api.del('/imposters').then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, { imposters: [] });
        });
    });

    it('deletes all imposters and returns replayable body', function (done) {
        var firstImposter = { protocol: 'http', port: port, name: this.name + '1' },
            secondImposter = { protocol: 'http', port: port + 1, name: this.name + '2' };

        return api.post('/imposters', firstImposter).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return api.post('/imposters', secondImposter);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return client.get('/', firstImposter.port);
        }).then(function () {
            return api.del('/imposters');
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, {
                imposters: [
                    {
                        protocol: 'http',
                        port: firstImposter.port,
                        name: firstImposter.name,
                        stubs: [],
                        _links: {
                            self: { href: 'http://localhost:' + api.port + '/imposters/' + firstImposter.port }
                        }
                    },
                    {
                        protocol: 'http',
                        port: secondImposter.port,
                        name: secondImposter.name,
                        stubs: [],
                        _links: {
                            self: { href: 'http://localhost:' + api.port + '/imposters/' + secondImposter.port }
                        }
                    }
                ]
            });

            return client.get('/', firstImposter.port);
        }).done(function () {
            assert.fail('did not close socket');
            done();
        }, function (error) {
            assert.strictEqual(error.code, 'ECONNREFUSED');
            done();
        });
    });
});
