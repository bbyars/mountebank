'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    BaseHttpClient = require('./baseHttpClient'),
    headersHelper = require('../../../src/models/http/headersHelper'),
    requestName = 'some request name';

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, () => {
        describe('POST /imposters/:id', () => {
            promiseIt('should auto-assign port if port not provided', () => {
                const request = { protocol, name: requestName };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', response.body.port);
                }).then(response => {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should not support CORS preflight requests if "allowCORS" option is disabled', () => {
                const request = { protocol, name: requestName };

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
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should support CORS preflight requests if "allowCORS" option is enabled', () => {
                const request = { protocol, name: requestName, allowCORS: true };

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

            promiseIt('should not handle non-preflight requests when "allowCORS" is enabled', () => {
                const request = { protocol, name: requestName, allowCORS: true };

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

            promiseIt('should default content type to json if not provided', () => {
                const request = { port, protocol, name: requestName };

                return api.post('/imposters', request, true).then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', port);
                }).then(response => {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(() => api.del('/imposters'));
            });
        });

        describe('GET /imposters/:id', () => {
            promiseIt('should provide access to all requests', () => {
                const imposterRequest = { protocol, port, name: requestName };

                return api.post('/imposters', imposterRequest).then(() => client.get('/first', port)
                ).then(() => client.get('/second', port)
                ).then(() => api.get(`/imposters/${port}`)
                ).then(response => {
                    const requests = response.body.requests.map(request => request.path);
                    assert.deepEqual(requests, ['/first', '/second']);
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should save headers in case-sensitive way', () => {
                const imposterRequest = { protocol, port, name: requestName };

                return api.post('/imposters', imposterRequest).then(() => client.responseFor({
                    method: 'GET',
                    path: '/',
                    port,
                    headers: {
                        Accept: 'APPLICATION/json'
                    }
                })
                ).then(() => api.get(`/imposters/${port}`)
                ).then(response => {
                    const request = response.body.requests[0];
                    assert.strictEqual(request.headers.Accept, 'APPLICATION/json');
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should return list of stubs in order', () => {
                const first = { responses: [{ is: { body: '1' } }] },
                    second = { responses: [{ is: { body: '2' } }] },
                    request = { protocol, port, stubs: [first, second], name: requestName };

                return api.post('/imposters', request).then(() => api.get(`/imposters/${port}`)
                ).then(response => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.deepEqual(response.body.stubs, [
                        { responses: [{ is: { body: '1' } }] },
                        { responses: [{ is: { body: '2' } }] }
                    ]);
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should record matches against stubs', () => {
                const stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return api.post('/imposters', request).then(() => client.get('/first?q=1', port)
                ).then(() => client.get('/second?q=2', port)
                ).then(() => api.get(`/imposters/${port}`)
                ).then(response => {
                    const stubs = JSON.stringify(response.body.stubs),
                        withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                        withClientPortRemoved = withTimeRemoved.replace(
                            /"requestFrom":"[a-f:.\d]+"/g, '"requestFrom":"HERE"'),
                        actualWithoutEphemeralData = JSON.parse(withClientPortRemoved),
                        requestHeaders = { accept: 'application/json', Host: `localhost:${port}`, Connection: 'keep-alive' };

                    assert.deepEqual(actualWithoutEphemeralData, [{
                        responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
                        matches: [
                            {
                                timestamp: 'NOW',
                                request: {
                                    requestFrom: 'HERE',
                                    path: '/first',
                                    query: { q: '1' },
                                    method: 'GET',
                                    headers: requestHeaders,
                                    body: ''
                                },
                                response: {
                                    statusCode: 200,
                                    headers: { Connection: 'close' },
                                    body: '1',
                                    _mode: 'text'
                                }
                            },
                            {
                                timestamp: 'NOW',
                                request: {
                                    requestFrom: 'HERE',
                                    path: '/second',
                                    query: { q: '2' },
                                    method: 'GET',
                                    headers: requestHeaders,
                                    body: ''
                                },
                                response: {
                                    statusCode: 200,
                                    headers: { Connection: 'close' },
                                    body: '2',
                                    _mode: 'text'
                                }
                            }
                        ]
                    }]);
                }).finally(() => api.del('/imposters')
                );
            });

            promiseIt('should not record matches against stubs if --debug flag is missing', () => {
                const stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return mb.start().then(() => mb.post('/imposters', request)
                ).then(() => client.get('/first?q=1', port)
                ).then(() => client.get('/second?q=2', port)
                ).then(() => mb.get(`/imposters/${port}`)
                ).then(response => {
                    assert.deepEqual(response.body.stubs, [{ responses: [{ is: { body: '1' } }, { is: { body: '2' } }] }]);
                }).finally(() => mb.stop());
            });

            promiseIt('should record numberOfRequests even if --mock flag is missing', () => {
                const stub = { responses: [{ is: { body: 'SUCCESS' } }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return mb.start().then(() => mb.post('/imposters', request)
                ).then(() => client.get('/', port)
                ).then(() => client.get('/', port)
                ).then(() => mb.get(`/imposters/${port}`)
                ).then(response => {
                    assert.strictEqual(response.body.numberOfRequests, 2);
                }).finally(() => mb.stop());
            });

            promiseIt('should return 404 if imposter has not been created', () =>
                api.get('/imposters/3535').then(response => assert.strictEqual(response.statusCode, 404))
            );
        });

        describe('DELETE /imposters/:id', () => {
            promiseIt('should shutdown server at that port', () => {
                const request = { protocol, port, name: requestName };

                return api.post('/imposters', request).then(response => api.del(response.headers.location)
                ).then(response => {
                    assert.strictEqual(response.statusCode, 200, 'Delete failed');
                    return api.post('/imposters', { protocol: 'http', port });
                }).then(response => {
                    assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
                }).finally(() => api.del(`/imposters/${port}`));
            });

            promiseIt('should return a 200 even if the server does not exist', () => api.del('/imposters/9999')
                .then(response => assert.strictEqual(response.statusCode, 200)));

            promiseIt('supports returning a replayable body with proxies removed', () => {
                const imposter = {
                    protocol: 'http',
                    port: port + 1,
                    name: requestName,
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
                        stubs: [{ responses: [{ is: { body: 'Hello, World!' } }] }]
                    });
                });
            });
        });
    }).timeout(timeout);
});
