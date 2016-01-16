'use strict';

var assert = require('assert'),
    api = require('../api'),
    client = require('./baseHttpClient').create('http'),
    promiseIt = require('../../testHelpers').promiseIt,
    compatibility = require('../../compatibility'),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('http proxy stubs', function () {
    if (isWindows) {
        // the DNS resolver errors take a lot longer on Windows
        this.timeout(10000);
    }
    else {
        this.timeout(timeout);
    }

    promiseIt('should allow proxy stubs to invalid domains', function () {
        var stub = { responses: [{ proxy: { to: 'http://invalid.domain' } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return api.post('/imposters', request).then(function () {
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 500);
            assert.strictEqual(response.body.errors[0].code, 'invalid proxy');
            assert.strictEqual(response.body.errors[0].message, 'Cannot resolve "http://invalid.domain"');
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should reflect default mode after first proxy if no mode passed in', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            proxyStub = { responses: [{ proxy: { to: 'http://localhost:' + originServerPort } }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'origin server');
            return api.get('/imposters/' + port);
        }).then(function (response) {
            assert.strictEqual(response.body.stubs[1].responses[0].proxy.mode, 'proxyOnce');
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should record new stubs in order in front of proxy resolver using proxyOnce mode', function () {
        var originServerPort = port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + request.method + ' ' + request.path
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyOnce',
                predicateGenerators: [
                    {
                        matches: {
                            method: true,
                            path: true
                        }
                    }
                ]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. GET /first');
            return client.del('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. DELETE /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. GET /second');
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. GET /first');
            return client.del('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. DELETE /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. GET /second');
            return api.del('/imposters/' + port);
        }).then(function (response) {
            assert.strictEqual(response.body.stubs.length, 4);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should record new stubs with multiple responses behind proxy resolver in proxyAlways mode', function () {
        var originServerPort = port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + request.path
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', port);
        }).then(function () {
            return client.get('/second', port);
        }).then(function () {
            return client.get('/first', port);
        }).then(function () {
            return api.del('/imposters/' + port);
        }).then(function (response) {
            assert.strictEqual(response.body.stubs.length, 3);

            var stubs = response.body.stubs,
                responses = stubs.splice(1).map(function (stub) {
                    return stub.responses.map(function (stubResponse) { return stubResponse.is.body; });
                });

            assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should match entire object graphs', function () {
        var originServerPort = port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + JSON.stringify(request.query)
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyOnce',
                predicateGenerators: [{ matches: { query: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/?first=1&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return client.get('/?first=1', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. {"first":"1"}');
            return client.get('/?first=2&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. {"first":"2","second":"2"}');
            return client.get('/?first=1&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return api.del('/imposters/' + originServerPort);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should match sub-objects', function () {
        var originServerPort = port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + JSON.stringify(request.query)
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyOnce',
                predicateGenerators: [{ matches: { query: { first: true } } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/?first=1&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return client.get('/?second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. {"second":"2"}');
            return client.get('/?first=2&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. {"first":"2","second":"2"}');
            return client.get('/?first=1&second=2&third=3', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return api.del('/imposters/' + originServerPort);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should support decorating response from origin server', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            decorator = function (request, response) {
                response.headers['X-Test'] = 'decorated';
            },
            proxyResponse = {
                proxy: { to: 'http://localhost:' + originServerPort },
                _behaviors: { decorate: decorator.toString() }
            },
            proxyStub = { responses: [proxyResponse] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'origin server');
            assert.strictEqual(response.headers['x-test'], 'decorated', JSON.stringify(response.headers, null, 2));
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should support retrieving replayable JSON with proxies removed for later playback', function () {
        var originServerPort = port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + request.path
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', port);
        }).then(function () {
            return client.get('/second', port);
        }).then(function () {
            return client.get('/first', port);
        }).then(function () {
            return api.del('/imposters/' + originServerPort);
        }).then(function () {
            return api.get('/imposters?replayable=true&removeProxies=true');
        }).then(function (response) {
            var actual = JSON.stringify(response.body),
                withDateRemoved = actual.replace(/"Date":"[^"]+"/g, '"Date":"NOW"'),
                withResponseTimeRemoved = withDateRemoved.replace(/"_proxyResponseTime":\d+/g, '"_proxyResponseTime":0'),
                actualWithoutEphemeralData = JSON.parse(withResponseTimeRemoved);

            assert.deepEqual(actualWithoutEphemeralData, {
                imposters: [
                    {
                        protocol: 'http',
                        port: port,
                        name: proxyRequest.name,
                        stubs: [
                            {
                                predicates: [
                                    {
                                        deepEquals: {
                                            path: '/first'
                                        }
                                    }
                                ],
                                responses: [
                                    {
                                        is: {
                                            statusCode: 200,
                                            headers: {
                                                Connection: 'close',
                                                Date: 'NOW',
                                                'Transfer-Encoding': 'chunked'
                                            },
                                            body: '1. /first',
                                            _mode: 'text',
                                            _proxyResponseTime: 0
                                        }
                                    },
                                    {
                                        is: {
                                            statusCode: 200,
                                            headers: {
                                                Connection: 'close',
                                                Date: 'NOW',
                                                'Transfer-Encoding': 'chunked'
                                            },
                                            body: '3. /first',
                                            _mode: 'text',
                                            _proxyResponseTime: 0
                                        }
                                    }
                                ]
                            },
                            {
                                predicates: [
                                    {
                                        deepEquals: {
                                            path: '/second'
                                        }
                                    }
                                ],
                                responses: [
                                    {
                                        is: {
                                            statusCode: 200,
                                            headers: {
                                                Connection: 'close',
                                                Date: 'NOW',
                                                'Transfer-Encoding': 'chunked'
                                            },
                                            body: '2. /second',
                                            _mode: 'text',
                                            _proxyResponseTime: 0
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            });
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should support returning binary data from origin server based on content encoding', function () {
        var buffer = new Buffer([0, 1, 2, 3]),
            originServerPort = port + 1,
            originServerResponse = {
                is: {
                    body: buffer.toString('base64'),
                    headers: { 'content-encoding': 'gzip' },
                    _mode: 'binary'
                }
            },
            originServerStub = { responses: [originServerResponse] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            proxyResponse = { proxy: { to: 'http://localhost:' + originServerPort } },
            proxyStub = { responses: [proxyResponse] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.responseFor({ method: 'GET', port: port, path: '/', mode: 'binary' });
        }).then(function (response) {
            assert.deepEqual(compatibility.bufferJSON(response.body), [0, 1, 2, 3]);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    if (process.env.MB_AIRPLANE_MODE !== 'true') {
        promiseIt('should support http proxy to https server', function () {
            var proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

            return api.post('/imposters', proxyRequest).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return client.get('/', port);
            }).then(function (response) {
                // Sometimes 301, sometimes 302
                assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');

                // https://www.google.com.br in Brasil, etc
                assert.ok(response.headers.location.indexOf('google.com') >= 0, response.headers.location);
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should maintain case of headers from origin', function () {
            var proxyStub = { responses: [{ proxy: { to: 'http://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' },
                isUpperCase = function (header) {
                    return header[0] === header[0].toUpperCase();
                };

            compatibility.patchRawHeaders();

            return api.post('/imposters', proxyRequest).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return client.get('/', port);
            }).then(function (response) {
                for (var i = 0; i < response.rawHeaders.length; i += 2) {
                    assert.ok(isUpperCase(response.rawHeaders[i]), response.rawHeaders[i] + ' is not upper-case');
                }
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    }
});
