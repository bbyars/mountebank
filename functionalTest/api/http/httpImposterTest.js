'use strict';

var assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    BaseHttpClient = require('./baseHttpClient'),
    fromSrc = require('../../testHelpers').fromSrc,
    headersHelper = require(fromSrc('models/http/headersHelper'));

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters/:id', function () {
            promiseIt('should auto-assign port if port not provided', function () {
                var request = { protocol: protocol, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', response.body.port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should not support CORS preflight requests if "allowCORS" option is disabled', function () {
                var request = { protocol: protocol, name: this.name };

                return api.post('/imposters', request).then(function (response) {
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
                }).then(function (response) {
                    var headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.ok(!headersJar.get('access-control-allow-headers'));
                    assert.ok(!headersJar.get('access-control-allow-methods'));
                    assert.ok(!headersJar.get('access-control-allow-origin'));
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support CORS preflight requests if "allowCORS" option is enabled', function () {
                var request = { protocol: protocol, name: this.name, allowCORS: true };

                return api.post('/imposters', request).then(function (response) {
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
                }).then(function (response) {
                    var headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.equal(headersJar.get('access-control-allow-headers'), 'X-Custom-Header');
                    assert.equal(headersJar.get('access-control-allow-methods'), 'PUT');
                    assert.equal(headersJar.get('access-control-allow-origin'), 'localhost:8080');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should not handle non-preflight requests when "allowCORS" is enabled', function () {
                var request = { protocol: protocol, name: this.name, allowCORS: true };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({
                        method: 'OPTIONS',
                        path: '/',
                        // Missing the necessary headers.
                        port: response.body.port
                    });
                }).then(function (response) {
                    var headersJar = headersHelper.getJar(response.headers);

                    assert.strictEqual(response.statusCode, 200);

                    assert.ok(!headersJar.get('access-control-allow-headers'));
                    assert.ok(!headersJar.get('access-control-allow-methods'));
                    assert.ok(!headersJar.get('access-control-allow-origin'));
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should default content type to json if not provided', function () {
                var request = { port: port, protocol: protocol, name: this.name };

                return api.post('/imposters', request, true).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.get('/first', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });
        });

        describe('GET /imposters/:id', function () {
            promiseIt('should provide access to all requests', function () {
                var imposterRequest = { protocol: protocol, port: port, name: this.name };

                return api.post('/imposters', imposterRequest).then(function () {
                    return client.get('/first', port);
                }).then(function () {
                    return client.get('/second', port);
                }).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    var requests = response.body.requests.map(function (request) { return request.path; });
                    assert.deepEqual(requests, ['/first', '/second']);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should save headers in case-sensitive way', function () {
                var imposterRequest = { protocol: protocol, port: port, name: this.name };

                return api.post('/imposters', imposterRequest).then(function () {
                    return client.responseFor({
                        method: 'GET',
                        path: '/',
                        port: port,
                        headers: {
                            Accept: 'APPLICATION/json'
                        }
                    });
                }).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    var request = response.body.requests[0];
                    assert.strictEqual(request.headers.Accept, 'APPLICATION/json');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should return list of stubs in order', function () {
                var first = { responses: [{ is: { body: '1' } }] },
                    second = { responses: [{ is: { body: '2' } }] },
                    request = { protocol: protocol, port: port, stubs: [first, second], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                    assert.deepEqual(response.body.stubs, [
                        { responses: [{ is: { body: '1' } }] },
                        { responses: [{ is: { body: '2' } }] }
                    ]);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should record matches against stubs', function () {
                var stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/first?q=1', port);
                }).then(function () {
                    return client.get('/second?q=2', port);
                }).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    var stubs = JSON.stringify(response.body.stubs),
                        withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                        withClientPortRemoved = withTimeRemoved.replace(
                            /"requestFrom":"[a-f:\.\d]+"/g, '"requestFrom":"HERE"'),
                        actualWithoutEphemeralData = JSON.parse(withClientPortRemoved),
                        requestHeaders = { accept: 'application/json', Host: 'localhost:' + port, Connection: 'keep-alive' };

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
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should not record matches against stubs if --debug flag is missing', function () {
                var stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return mb.start().then(function () {
                    return mb.post('/imposters', request);
                }).then(function () {
                    return client.get('/first?q=1', port);
                }).then(function () {
                    return client.get('/second?q=2', port);
                }).then(function () {
                    return mb.get('/imposters/' + port);
                }).then(function (response) {
                    assert.deepEqual(response.body.stubs, [{ responses: [{ is: { body: '1' } }, { is: { body: '2' } }] }]);
                }).finally(function () {
                    return mb.stop();
                });
            });

            promiseIt('should record numberOfRequests even if --mock flag is missing', function () {
                var stub = { responses: [{ is: { body: 'SUCCESS' } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return mb.start().then(function () {
                    return mb.post('/imposters', request);
                }).then(function () {
                    return client.get('/', port);
                }).then(function () {
                    return client.get('/', port);
                }).then(function () {
                    return mb.get('/imposters/' + port);
                }).then(function (response) {
                    assert.strictEqual(response.body.numberOfRequests, 2);
                }).finally(function () {
                    return mb.stop();
                });
            });

            promiseIt('should return 404 if imposter has not been created', function () {
                return api.get('/imposters/3535').then(function (response) {
                    assert.strictEqual(response.statusCode, 404);
                });
            });
        });

        describe('DELETE /imposters/:id', function () {
            promiseIt('should shutdown server at that port', function () {
                var request = { protocol: protocol, port: port, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    return api.del(response.headers.location);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'Delete failed');

                    return api.post('/imposters', { protocol: 'http', port: port });
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should return a 200 even if the server does not exist', function () {
                return api.del('/imposters/9999').then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                });
            });

            promiseIt('supports returning a replayable body with proxies removed', function () {
                var imposter = {
                    protocol: 'http',
                    port: port + 1,
                    name: this.name,
                    stubs: [{ responses: [
                        { proxy: { to: 'http://www.google.com' } },
                        { is: { body: 'Hello, World!' } }
                    ] }]
                };

                return api.post('/imposters', imposter).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return api.del('/imposters/' + imposter.port + '?removeProxies=true&replayable=true');
                }).then(function (response) {
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
    });
});
