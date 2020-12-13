'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    BaseHttpClient = require('./baseHttpClient'),
    headersHelper = require('../../../src/models/http/headersHelper');

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        describe('POST /imposters/:id', function () {
            promiseIt('should auto-assign port if port not provided', function () {
                const request = { protocol };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', response.body.port);
                }).then(response => {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should not support CORS preflight requests if "allowCORS" option is disabled', function () {
                const request = { protocol };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        headers: {
                            'Access-Control-Request-Method': 'PUT',
                            'Access-Control-Request-Headers': 'X-Custom-Header',
                            Origin: 'localhost:8080'
                        },
                        port: response.body.port
                    });
                }).then(response => {
                    const headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.ok(!headersJar.get('access-control-allow-headers'));
                    assert.ok(!headersJar.get('access-control-allow-methods'));
                    assert.ok(!headersJar.get('access-control-allow-origin'));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support CORS preflight requests if "allowCORS" option is enabled', function () {
                const request = { protocol, allowCORS: true };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        headers: {
                            'Access-Control-Request-Method': 'PUT',
                            'Access-Control-Request-Headers': 'X-Custom-Header',
                            Origin: 'localhost:8080'
                        },
                        port: response.body.port
                    });
                }).then(response => {
                    const headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.equal(headersJar.get('access-control-allow-headers'), 'X-Custom-Header');
                    assert.equal(headersJar.get('access-control-allow-methods'), 'PUT');
                    assert.equal(headersJar.get('access-control-allow-origin'), 'localhost:8080');
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should not handle non-preflight requests when "allowCORS" is enabled', function () {
                const request = { protocol, allowCORS: true };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        // Missing the necessary headers.
                        port: response.body.port
                    });
                }).then(response => {
                    const headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.ok(!headersJar.get('access-control-allow-headers'));
                    assert.ok(!headersJar.get('access-control-allow-methods'));
                    assert.ok(!headersJar.get('access-control-allow-origin'));
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should default content type to json if not provided', function () {
                const request = { port, protocol };

                return api.post('/imposters', request, true).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', port);
                }).then(response => {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(() => api.del('/imposters'));
            });
        });

        describe('GET /imposters/:id', function () {
            promiseIt('should provide access to all requests', function () {
                const imposterRequest = { protocol, port };

                return api.post('/imposters', imposterRequest)
                    .then(() => client.get('/first', port))
                    .then(() => client.get('/second', port))
                    .then(() => api.get(`/imposters/${port}`))
                    .then(response => {
                        const requests = response.body.requests.map(request => request.path);
                        assert.deepEqual(requests, ['/first', '/second']);
                    })
                    .finally(() => api.del('/imposters'));
            });

            promiseIt('should save headers in case-sensitive way', function () {
                const imposterRequest = { protocol, port };

                return api.post('/imposters', imposterRequest)
                    .then(() => client.responseFor({
                        method: 'GET',
                        path: '/',
                        port,
                        headers: {
                            Accept: 'APPLICATION/json'
                        }
                    }))
                    .then(() => api.get(`/imposters/${port}`))
                    .then(response => {
                        const request = response.body.requests[0];
                        assert.strictEqual(request.headers.Accept, 'APPLICATION/json');
                    })
                    .finally(() => api.del('/imposters'));
            });

            promiseIt('should return list of stubs in order', function () {
                const first = { responses: [{ is: { body: '1' } }] },
                    second = { responses: [{ is: { body: '2' } }] },
                    request = { protocol, port, stubs: [first, second] };

                return api.post('/imposters', request)
                    .then(() => api.get(`/imposters/${port}`))
                    .then(response => {
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
                    })
                    .finally(() => api.del('/imposters'));
            });

            promiseIt('should record numberOfRequests even if --mock flag is missing', function () {
                const stub = { responses: [{ is: { body: 'SUCCESS' } }] },
                    request = { protocol, port, stubs: [stub] };

                return mb.start()
                    .then(() => mb.post('/imposters', request))
                    .then(() => client.get('/', port))
                    .then(() => client.get('/', port))
                    .then(() => mb.get(`/imposters/${port}`))
                    .then(response => {
                        assert.strictEqual(response.body.numberOfRequests, 2);
                    })
                    .finally(() => mb.stop());
            });

            promiseIt('should return 404 if imposter has not been created', function () {
                return api.get('/imposters/3535').then(response => {
                    assert.strictEqual(response.statusCode, 404);
                });
            });
        });

        describe('DELETE /imposters/:id', function () {
            promiseIt('should shutdown server at that port', function () {
                const request = { protocol, port };

                return api.post('/imposters', request)
                    .then(response => api.del(response.headers.location))
                    .then(response => {
                        assert.strictEqual(response.statusCode, 200, 'Delete failed');
                        return api.post('/imposters', { protocol: 'http', port });
                    })
                    .then(response => {
                        assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
                    })
                    .finally(() => api.del(`/imposters/${port}`));
            });

            promiseIt('should return a 200 even if the server does not exist', function () {
                return api.del('/imposters/9999')
                    .then(response => assert.strictEqual(response.statusCode, 200));
            });

            promiseIt('supports returning a replayable body with proxies removed', function () {
                const imposter = {
                    protocol: 'http',
                    port: port + 1,
                    name: 'impoter',
                    stubs: [{ responses: [
                        { proxy: { to: 'http://www.google.com' } },
                        { is: { body: 'Hello, World!' } }
                    ] }]
                };

                return api.post('/imposters', imposter).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return api.del(`/imposters/${imposter.port}?removeProxies=true&replayable=true`);
                }).then(response => {
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
        });

        describe('DELETE /imposters/:id/savedRequests', function () {
            promiseIt('should return the imposter post requests-deletion', function () {
                const imposterRequest = { protocol, port, recordRequests: true };

                return api.post('/imposters', imposterRequest)
                    .then(() => client.get('/first', port))
                    .then(() => api.get(`/imposters/${port}`))
                    .then(response => {
                        const requests = response.body.requests.map(request => request.path);
                        assert.deepEqual(requests, ['/first']);
                    })
                    .then(() => api.del(`/imposters/${port}/savedRequests`))
                    .then(() => api.get(`/imposters/${port}`))
                    .then(response => {
                        assert.deepEqual(response.body.requests, []);
                        assert.strictEqual(0, response.body.numberOfRequests);
                    })
                    .finally(() => api.del('/imposters'));
            });
        });
    });
});
