'use strict';

var assert = require('assert'),
    fs = require('fs'),
    util = require('util'),
    api = require('../api').create(),
    client = require('./baseHttpClient').create('http'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('http proxy stubs', function () {
    if (isWindows) {
        // the DNS resolver errors take a lot longer on Windows
        this.timeout(10000);
    }
    else {
        this.timeout(timeout);
    }

    if (!airplaneMode) {
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
    }

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
            assert.strictEqual(response.body.stubs[1].responses[0].proxy.mode, 'proxyOnce', response.body);
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
            assert.strictEqual(response.body.stubs.length, 3, JSON.stringify(response.body.stubs, null, 2));

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

    promiseIt('should persist behaviors from origin server', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: '${SALUTATION} ${NAME}' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            shellFn = function exec () {
                console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
            },
            decorator = function (request, response) {
                response.headers['X-Test'] = 'decorated';
            },
            proxyResponse = {
                proxy: { to: 'http://localhost:' + originServerPort },
                _behaviors: {
                    decorate: decorator.toString(),
                    shellTransform: 'node shellTransformTest.js',
                    copy: [{
                        from: 'path',
                        into: '${NAME}',
                        using: { method: 'regex', selector: '\\w+' }
                    }]
                }
            },
            proxyStub = { responses: [proxyResponse] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/mountebank', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'Hello mountebank');
            assert.strictEqual(response.headers['x-test'], 'decorated', JSON.stringify(response.headers, null, 2));
            return client.get('/world', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'Hello mountebank');
            assert.strictEqual(response.headers['x-test'], 'decorated', JSON.stringify(response.headers, null, 2));
        }).finally(function () {
            fs.unlinkSync('shellTransformTest.js');
            return api.del('/imposters');
        });
    });

    promiseIt('should support adding latency to saved responses based on how long the origin server took to respond', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' }, _behaviors: { wait: 100 } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            proxyStub = { responses: [{ proxy: {
                to: 'http://localhost:' + originServerPort,
                addWaitBehavior: true
            } }] },
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
            var stubResponse = response.body.stubs[0].responses[0];
            // eslint-disable-next-line no-underscore-dangle
            assert.strictEqual(stubResponse._behaviors.wait, stubResponse.is._proxyResponseTime, JSON.stringify(stubResponse, null, 4));
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
                actualWithoutEphemeralData = JSON.parse(withDateRemoved);

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
                                            _mode: 'text'
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
                                            _mode: 'text'
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
                                            _mode: 'text'
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
            assert.deepEqual(response.body.toJSON().data, [0, 1, 2, 3]);
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should persist decorated proxy responses and only run decorator once', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            decorator = function (request, response) {
                response.body += ' decorated';
            },
            proxyStub = { responses: [{
                proxy: { to: 'http://localhost:' + originServerPort },
                _behaviors: { decorate: decorator.toString() }
            }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'origin server decorated');
            return api.get('/imposters/' + port);
        }).then(function (response) {
            assert.strictEqual(response.body.stubs[0].responses[0].is.body, 'origin server decorated');
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    if (!airplaneMode) {
        promiseIt('should support http proxy to https server', function () {
            var proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

            return api.post('/imposters', proxyRequest).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return client.get('/', port);
            }).then(function (response) {
                // Sometimes 301, sometimes 302
                assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');

                // https://www.google.com.br in Brasil, google.ca in Canada, etc
                assert.ok(response.headers.location.indexOf('google.') >= 0, response.headers.location);
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

        promiseIt('should inject proxy headers if specified', function () {
            var proxyPort = port + 1;
            var mirrorPort = port + 2;

            var proxyStub = { responses: [{ proxy: { to: 'http://localhost:' + mirrorPort,
                    injectHeaders: { 'X-Forwarded-Host': 'http://www.google.com' } } }] },
                proxyStubRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: 'proxy stub' },
                mirrorStub = { responses: [{ is: { body: '' }, _behaviors: {
                    decorate: (function (request, response) { response.headers = request.headers; }).toString() } }] },
                mirrorStubRequest = { protocol: 'http', port: mirrorPort, stubs: [mirrorStub], name: 'mirror stub' };

            return api.post('/imposters', mirrorStubRequest).then(function (response) {
                assert.equal(201, response.statusCode);
                return api.post('/imposters', proxyStubRequest);
            }).then(function (response) {
                assert.equal(201, response.statusCode);
                return client.get('/', proxyPort);
            }).then(function (response) {
                assert.equal(response.headers['x-forwarded-host'], 'http://www.google.com');
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    }

    promiseIt('should not default to chunked encoding on proxied request (issue #132)', function () {
        var originServerPort = port + 1,
            fn = function (request, state, logger) {
                function hasHeaderKey (headerKey, headers) {
                    return Object.keys(headers).some(function (header) {
                        return header.toLowerCase() === headerKey.toLowerCase();
                    });
                }

                var encoding = '';
                logger.warn(JSON.stringify(request.headers, null, 4));
                if (hasHeaderKey('Transfer-Encoding', request.headers)) {
                    encoding = 'chunked';
                }
                else if (hasHeaderKey('Content-Length', request.headers)) {
                    encoding = 'content-length';
                }
                return {
                    body: 'Encoding: ' + encoding
                };
            },
            originServerStub = { responses: [{ inject: fn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            proxyStub = { responses: [{ proxy: {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyAlways',
                predicateGenerators: [{
                    matches: {
                        method: true,
                        path: true,
                        query: true
                    }
                }]
            } }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.responseFor({
                method: 'PUT',
                path: '/',
                port: port,
                body: 'TEST',
                headers: { 'Content-Length': 4 } // needed to bypass node's implicit chunked encoding
            });
        }).then(function (response) {
            assert.strictEqual(response.body, 'Encoding: content-length');
        }).finally(function () {
            return api.del('/imposters');
        });
    });

    promiseIt('should add decorate behaviors to newly created response', function () {
        var originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin'
            },
            decorator = function (request, response) {
                response.body += ' decorated';
            },
            proxyStub = { responses: [{
                proxy: { to: 'http://localhost:' + originServerPort, addDecorateBehavior: decorator.toString() }
            }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'origin server');
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'origin server decorated');
        }).finally(function () {
            return api.del('/imposters');
        });
    });
});
