'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    client = require('../baseHttpClient').create('http');

describe('POST /imposters', function () {

    afterEach(async function () {
        await api.del('/imposters');
    });

    it('should return create new imposter with consistent hypermedia', async function () {
        const creationResponse = await api.createImposter({ protocol: 'http', port });
        assert.strictEqual(creationResponse.headers.location, creationResponse.body._links.self.href);

        const imposterResponse = await api.get(creationResponse.headers.location);
        assert.strictEqual(imposterResponse.statusCode, 200);
        assert.deepEqual(imposterResponse.body, creationResponse.body);
    });

    it('should create imposter at provided port', async function () {
        await api.createImposter({ protocol: 'http', port });

        const response = await api.get('/', port);

        assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
    });

    it('should return 400 on invalid input', async function () {
        const response = await api.post('/imposters', {});

        assert.strictEqual(response.statusCode, 400);
    });

    it('should return 400 on port conflict', async function () {
        const response = await api.post('/imposters', { protocol: 'http', port: api.port });

        assert.strictEqual(response.statusCode, 400);
    });

    it('should return 400 on invalid JSON', async function () {
        const response = await api.post('/imposters', 'invalid');

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

describe('DELETE /imposters', function () {
    it('returns 200 with empty array if no imposters had been created', async function () {
        const response = await api.del('/imposters');

        assert.strictEqual(response.statusCode, 200);
        assert.deepEqual(response.body, { imposters: [] });
    });

    it('deletes all imposters and returns replayable body', async function () {
        const firstImposter = { protocol: 'http', port, name: 'imposter 1' },
            secondImposter = { protocol: 'http', port: port + 1, name: 'imposter 1' };
        await api.createImposter(firstImposter);
        await api.createImposter(secondImposter);

        await client.get('/', firstImposter.port);
        const response = await api.del('/imposters');

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

        try {
            await client.get('/', firstImposter.port);
            assert.fail('did not close socket');
        }
        catch (error) {
            assert.strictEqual(error.code, 'ECONNREFUSED');
        }
    });

    it('supports returning a non-replayable body with proxies removed', async function () {
        const isImposter = {
                protocol: 'http',
                port,
                name: 'imposter-is',
                stubs: [{ responses: [{ is: { body: 'Hello, World!' } }] }]
            },
            proxyImposter = {
                protocol: 'http',
                port: port + 1,
                name: 'imposter-proxy',
                stubs: [{ responses: [{ proxy: { to: 'http://www.google.com' } }] }]
            };
        await api.createImposter(isImposter);
        await api.createImposter(proxyImposter);

        const response = await api.del('/imposters?removeProxies=true&replayable=false');

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
                    stubs: [{
                        responses: [{ is: { body: 'Hello, World!' } }],
                        _links: { self: { href: `${api.url}/imposters/${isImposter.port}/stubs/0` } }
                    }],
                    _links: {
                        self: { href: `http://localhost:${api.port}/imposters/${isImposter.port}` },
                        stubs: { href: `http://localhost:${api.port}/imposters/${isImposter.port}/stubs` }
                    }
                },
                {
                    protocol: 'http',
                    port: proxyImposter.port,
                    name: proxyImposter.name,
                    recordRequests: false,
                    numberOfRequests: 0,
                    requests: [],
                    stubs: [],
                    _links: {
                        self: { href: `http://localhost:${api.port}/imposters/${proxyImposter.port }` },
                        stubs: { href: `http://localhost:${api.port}/imposters/${proxyImposter.port}/stubs` }
                    }
                }
            ]
        });
    });
});

describe('PUT /imposters', function () {
    afterEach(async function () {
        await api.del('/imposters');
    });

    it('creates all imposters provided when no imposters previously exist', async function () {
        const request = {
            imposters: [
                { protocol: 'http', port, name: 'imposter 1' },
                { protocol: 'http', port: port + 1, name: 'imposter 2' },
                { protocol: 'http', port: port + 2, name: 'imposter 3' }
            ]
        };

        const creationResponse = await api.put('/imposters', request);
        assert.strictEqual(creationResponse.statusCode, 200);

        const first = await client.get('/', port);
        assert.strictEqual(first.statusCode, 200);

        const second = await client.get('/', port + 1);
        assert.strictEqual(second.statusCode, 200);

        const third = await client.get('/', port + 2);
        assert.strictEqual(third.statusCode, 200);
    });

    it('overwrites previous imposters', async function () {
        const postRequest = { protocol: 'smtp', port: port },
            putRequest = {
                imposters: [
                    { protocol: 'http', port, name: 'imposter 1' },
                    { protocol: 'http', port: port + 1, name: 'imposter 2' },
                    { protocol: 'http', port: port + 2, name: 'imposter 3' }
                ]
            };
        await api.createImposter(postRequest);

        const putResponse = await api.put('/imposters', putRequest);
        assert.strictEqual(putResponse.statusCode, 200);

        const first = await client.get('/', port);
        assert.strictEqual(first.statusCode, 200);

        const second = await client.get('/', port + 1);
        assert.strictEqual(second.statusCode, 200);

        const third = await client.get('/', port + 2);
        assert.strictEqual(third.statusCode, 200);
    });
});
