'use strict';

var assert = require('assert'),
    api = require('./api'),
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    Q = require('q'),
    isWindows = require('os').platform().indexOf('win') === 0,
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

    promiseIt('should return 400 on invalid JSON', function () {
        return api.post('/imposters', 'invalid').then(function (response) {
            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'invalid JSON',
                    message: 'Unable to parse body as JSON',
                    source: 'invalid'
                }]
            });
        });
    });

    promiseIt('should return 403 when does not have permission to bind to port', function () {
        if (isWindows) {
            return Q(true); // no sudo required
        }
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
                        stubs: []
                    },
                    {
                        protocol: 'http',
                        port: secondImposter.port,
                        name: secondImposter.name,
                        stubs: []
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

    promiseIt('supports returning a non-replayable body with proxies removed', function () {
        var isImposter = {
                protocol: 'http',
                port: port, name:
                this.name + '-is',
                stubs: [{ responses: [{ is: { body: 'Hello, World!' } }] }]
            },
            proxyImposter = {
                protocol: 'http',
                port: port + 1,
                name: this.name + '-proxy',
                stubs: [{ responses: [{ proxy: { to: 'http://www.google.com' } }] }]
            };

        return api.post('/imposters', isImposter).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return api.post('/imposters', proxyImposter);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return api.del('/imposters?removeProxies=true&replayable=false');
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, {
                imposters: [
                    {
                        protocol: 'http',
                        port: isImposter.port,
                        name: isImposter.name,
                        requests: [],
                        stubs: isImposter.stubs,
                        _links: { self: { href: 'http://localhost:' + api.port + '/imposters/' + isImposter.port } }
                    },
                    {
                        protocol: 'http',
                        port: proxyImposter.port,
                        name: proxyImposter.name,
                        requests: [],
                        stubs: [],
                        _links: { self: { href: 'http://localhost:' + api.port + '/imposters/' + proxyImposter.port } }
                    }
                ]
            });
        });
    });
});

describe('PUT /imposters', function () {
    promiseIt('creates all imposters provided when no imposters previously exist', function () {
        var request = {
            imposters: [
                { protocol: 'http', port: port, name: this.name + '1' },
                { protocol: 'http', port: port + 1, name: this.name + '2' },
                { protocol: 'http', port: port + 2, name: this.name + '3' }
            ]
        };

        return api.put('/imposters', request).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 1);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 2);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('overwrites previous imposters', function () {
        var postRequest = { protocol: 'smtp', port: port },
            putRequest = {
                imposters: [
                    { protocol: 'http', port: port, name: this.name + '1' },
                    { protocol: 'http', port: port + 1, name: this.name + '2' },
                    { protocol: 'http', port: port + 2, name: this.name + '3' }
                ]
            };

        return api.post('/imposters', postRequest).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return api.put('/imposters', putRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 1);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 2);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        }).finally(function () {
            return api.del('/imposters');
        });
    });
});
