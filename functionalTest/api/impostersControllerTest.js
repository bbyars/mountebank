'use strict';

const assert = require('assert'),
    api = require('./api').create(),
    isInProcessImposter = require('../testHelpers').isInProcessImposter('http'),
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    Q = require('q'),
    isWindows = require('os').platform().indexOf('win') === 0,
    client = require('./http/baseHttpClient').create('http');

describe('POST /imposters', function () {

    promiseIt('should return create new imposter with consistent hypermedia', function () {
        let createdBody, imposterPath;

        return api.post('/imposters', { protocol: 'http', port }).then(response => {
            createdBody = response.body;

            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.headers.location, response.body._links.self.href);

            return api.get(response.headers.location);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, createdBody);
        }).finally(() => api.del(imposterPath));
    });

    promiseIt('should create imposter at provided port', function () {
        return api.post('/imposters', { protocol: 'http', port })
            .then(() => api.get('/', port))
            .then(response => {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
            })
            .finally(() => api.del(`/imposters/${port}`));
    });

    promiseIt('should return 400 on invalid input', function () {
        return api.post('/imposters', {}).then(response => {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return 400 on port conflict', function () {
        return api.post('/imposters', { protocol: 'http', port: api.port }).then(response => {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return 400 on invalid JSON', function () {
        return api.post('/imposters', 'invalid').then(response => {
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

    promiseIt('should return error when does not have permission to bind to port', function () {
        if (isWindows) {
            return Q(true); // no sudo required
        }
        return api.post('/imposters', { protocol: 'http', port: 90 }).then(response => {
            const expected = isInProcessImposter ? 403 : 400;
            assert.strictEqual(response.statusCode, expected);
        });
    });
});

describe('DELETE /imposters', function () {
    promiseIt('returns 200 with empty array if no imposters had been created', function () {
        return api.del('/imposters').then(response => {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, { imposters: [] });
        });
    });

    it('deletes all imposters and returns replayable body', function (done) {
        const firstImposter = { protocol: 'http', port, name: 'imposter 1' },
            secondImposter = { protocol: 'http', port: port + 1, name: 'imposter 1' };

        return api.post('/imposters', firstImposter).then(response => {
            assert.strictEqual(response.statusCode, 201);
            return api.post('/imposters', secondImposter);
        }).then(response => {
            assert.strictEqual(response.statusCode, 201);
            return client.get('/', firstImposter.port);
        }).then(() => api.del('/imposters')).then(response => {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, {
                imposters: [
                    {
                        protocol: 'http',
                        port: firstImposter.port,
                        name: firstImposter.name,
                        recordRequests: false,
                        stubs: []
                    },
                    {
                        protocol: 'http',
                        port: secondImposter.port,
                        name: secondImposter.name,
                        recordRequests: false,
                        stubs: []
                    }
                ]
            });

            return client.get('/', firstImposter.port);
        }).done(() => {
            assert.fail('did not close socket');
            done();
        }, error => {
            assert.strictEqual(error.code, 'ECONNREFUSED');
            done();
        });
    });

    promiseIt('supports returning a non-replayable body with proxies removed', function () {
        const isImposter = {
                protocol: 'http',
                port, name:
                'imposter-is',
                stubs: [{ responses: [{ is: { body: 'Hello, World!' } }] }]
            },
            proxyImposter = {
                protocol: 'http',
                port: port + 1,
                name: 'imposter-proxy',
                stubs: [{ responses: [{ proxy: { to: 'http://www.google.com' } }] }]
            };

        return api.post('/imposters', isImposter).then(response => {
            assert.strictEqual(response.statusCode, 201);
            return api.post('/imposters', proxyImposter);
        }).then(response => {
            assert.strictEqual(response.statusCode, 201);
            return api.del('/imposters?removeProxies=true&replayable=false');
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, {
                imposters: [
                    {
                        protocol: 'http',
                        port: isImposter.port,
                        name: isImposter.name,
                        recordRequests: false,
                        numberOfRequests: 0,
                        requests: [],
                        stubs: isImposter.stubs,
                        _links: { self: { href: `http://localhost:${api.port}/imposters/${isImposter.port}` } }
                    },
                    {
                        protocol: 'http',
                        port: proxyImposter.port,
                        name: proxyImposter.name,
                        recordRequests: false,
                        numberOfRequests: 0,
                        requests: [],
                        stubs: [],
                        _links: { self: { href: `http://localhost:${api.port}/imposters/${proxyImposter.port }` } }
                    }
                ]
            });
        });
    });
});

describe('PUT /imposters', function () {
    promiseIt('creates all imposters provided when no imposters previously exist', () => {
        const request = {
            imposters: [
                { protocol: 'http', port, name: 'imposter 1' },
                { protocol: 'http', port: port + 1, name: 'imposter 2' },
                { protocol: 'http', port: port + 2, name: 'imposter 3' }
            ]
        };

        return api.put('/imposters', request).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 1);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 2);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        }).finally(() => api.del('/imposters'));
    });

    promiseIt('overwrites previous imposters', function () {
        const postRequest = { protocol: 'smtp', port: port },
            putRequest = {
                imposters: [
                    { protocol: 'http', port, name: 'imposter 1' },
                    { protocol: 'http', port: port + 1, name: 'imposter 2' },
                    { protocol: 'http', port: port + 2, name: 'imposter 3' }
                ]
            };

        return api.post('/imposters', postRequest).then(response => {
            assert.strictEqual(response.statusCode, 201);
            return api.put('/imposters', putRequest);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 1);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return client.get('/', port + 2);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        }).finally(() => api.del('/imposters'));
    });
});
