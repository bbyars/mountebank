'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    mb = require('../../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    BaseHttpClient = require('./baseHttpClient'),
    headersHelper = require('../../../src/models/http/headersHelper');

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        afterEach(async function () {
            await api.del('/imposters');
        });

        describe('POST /imposters/:id', function () {
            it('should auto-assign port if port not provided', async function () {
                const request = { protocol },
                    creationResponse = await api.createImposter(request);

                const response = await client.get('/first', creationResponse.body.port);

                assert.strictEqual(response.statusCode, 200);
            });

            it('should not support CORS preflight requests if "allowCORS" option is disabled', async function () {
                const request = { protocol },
                    creationResponse = await api.createImposter(request);

                const response = await client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        headers: {
                            'Access-Control-Request-Method': 'PUT',
                            'Access-Control-Request-Headers': 'X-Custom-Header',
                            Origin: 'localhost:8080'
                        },
                        port: creationResponse.body.port
                    }),
                    headers = headersHelper.getJar(response.headers);

                assert.strictEqual(response.statusCode, 200);
                assert.ok(!headers.get('access-control-allow-headers'));
                assert.ok(!headers.get('access-control-allow-methods'));
                assert.ok(!headers.get('access-control-allow-origin'));
            });

            it('should support CORS preflight requests if "allowCORS" option is enabled', async function () {
                const request = { protocol, allowCORS: true },
                    creationResponse = await api.createImposter(request);

                const response = await client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        headers: {
                            'Access-Control-Request-Method': 'PUT',
                            'Access-Control-Request-Headers': 'X-Custom-Header',
                            Origin: 'localhost:8080'
                        },
                        port: creationResponse.body.port
                    }),
                    headers = headersHelper.getJar(response.headers);

                assert.strictEqual(response.statusCode, 200);
                assert.equal(headers.get('access-control-allow-headers'), 'X-Custom-Header');
                assert.equal(headers.get('access-control-allow-methods'), 'PUT');
                assert.equal(headers.get('access-control-allow-origin'), 'localhost:8080');
            });

            it('should not handle non-preflight requests when "allowCORS" is enabled', async function () {
                const request = { protocol, allowCORS: true },
                    creationResponse = await api.createImposter(request);

                const response = await client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        // Missing the necessary headers.
                        port: creationResponse.body.port
                    }),
                    headers = headersHelper.getJar(response.headers);

                assert.strictEqual(response.statusCode, 200);
                assert.ok(!headers.get('access-control-allow-headers'));
                assert.ok(!headers.get('access-control-allow-methods'));
                assert.ok(!headers.get('access-control-allow-origin'));
            });

            it('should default content type to json if not provided', async function () {
                const request = { port, protocol };
                await api.createImposter(request);

                const response = await client.get('/first', port);

                assert.strictEqual(response.statusCode, 200);
            });
        });

        describe('GET /imposters/:id', function () {
            it('should provide access to all requests', async function () {
                const imposterRequest = { protocol, port };
                await api.createImposter(imposterRequest);

                await client.get('/first', port);
                await client.get('/second', port);
                const response = await api.get(`/imposters/${port}`),
                    requests = response.body.requests.map(request => request.path);

                assert.deepEqual(requests, ['/first', '/second']);
            });

            it('should save headers in case-sensitive way', async function () {
                const imposterRequest = { protocol, port };
                await api.createImposter(imposterRequest);

                await client.responseFor({
                    method: 'GET',
                    path: '/',
                    port,
                    headers: {
                        Accept: 'APPLICATION/json'
                    }
                });
                const response = await api.get(`/imposters/${port}`),
                    request = response.body.requests[0];

                assert.strictEqual(request.headers.Accept, 'APPLICATION/json');
            });

            it('should return list of stubs in order', async function () {
                const first = { responses: [{ is: { body: '1' } }] },
                    second = { responses: [{ is: { body: '2' } }] },
                    request = { protocol, port, stubs: [first, second] };
                await api.createImposter(request);

                const response = await api.get(`/imposters/${port}`);

                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body.stubs, [
                    {
                        responses: [{ is: { body: '1' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: '2' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    }
                ]);
            });

            it('should record numberOfRequests even if --mock flag is missing', async function () {
                const stub = { responses: [{ is: { body: 'SUCCESS' } }] },
                    request = { protocol, port, stubs: [stub] };

                try {
                    await mb.start();
                    await mb.post('/imposters', request);

                    await client.get('/', port);
                    await client.get('/', port);
                    const response = await mb.get(`/imposters/${port}`);

                    assert.strictEqual(response.body.numberOfRequests, 2);
                }
                finally {
                    await mb.stop();
                }
            });

            it('should return 404 if imposter has not been created', async function () {
                const response = await api.get('/imposters/3535');

                assert.strictEqual(response.statusCode, 404);
            });
        });

        describe('DELETE /imposters/:id', function () {
            it('should shutdown server at that port', async function () {
                const request = { protocol, port },
                    creationResponse = await api.createImposter(request);

                const deletionResponse = await api.del(creationResponse.headers.location);
                assert.strictEqual(deletionResponse.statusCode, 200, 'Delete failed');

                const secondCreationResponse = await api.createImposter({ protocol: 'http', port });
                assert.strictEqual(secondCreationResponse.statusCode, 201, 'Delete did not free up port');
            });

            it('should return a 200 even if the server does not exist', async function () {
                const response = await api.del('/imposters/9999');

                assert.strictEqual(response.statusCode, 200);
            });

            it('supports returning a replayable body with proxies removed', async function () {
                const imposter = {
                    protocol: 'http',
                    port: port + 1,
                    name: 'impoter',
                    stubs: [{ responses: [
                        { proxy: { to: 'http://www.google.com' } },
                        { is: { body: 'Hello, World!' } }
                    ] }]
                };
                await api.createImposter(imposter);

                const response = await api.del(`/imposters/${imposter.port}?removeProxies=true&replayable=true`);

                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body, {
                    protocol: 'http',
                    port: port + 1,
                    name: imposter.name,
                    recordRequests: false,
                    stubs: [{ responses: [{ is: { body: 'Hello, World!' } }] }]
                });
            });
        });

        describe('DELETE /imposters/:id/savedRequests', function () {
            it('should return the imposter post requests-deletion', async function () {
                const imposterRequest = { protocol, port, recordRequests: true };
                await api.createImposter(imposterRequest);

                await client.get('/first', port);
                const firstQuery = await api.get(`/imposters/${port}`),
                    requests = firstQuery.body.requests.map(request => request.path);

                assert.deepEqual(requests, ['/first']);

                await api.del(`/imposters/${port}/savedRequests`);
                const secondQuery = await api.get(`/imposters/${port}`);

                assert.deepEqual(secondQuery.body.requests, []);
                assert.strictEqual(0, secondQuery.body.numberOfRequests);
            });
        });
    });
});
