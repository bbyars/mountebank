'use strict';

const assert = require('assert'),
    fs = require('fs-extra'),
    api = require('../api').create(),
    client = require('./baseHttpClient').create('http'),
    isInProcessImposter = require('../../testHelpers').isInProcessImposter,
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('http proxy stubs', function () {
    this.timeout(timeout);

    afterEach(async function () {
        api.del('/imposters');
    });

    it('should send same request information to proxied url', async function () {
        const origin = { protocol: 'http', port, recordRequests: true },
            proxy = {
                protocol: 'http',
                port: port + 1,
                stubs: [{
                    responses: [{ proxy: { to: `http://localhost:${port}` } }]
                }]
            },
            request = { port: proxy.port, path: '/PATH', method: 'POST', body: 'BODY', headers: { 'X-Key': 'TRUE' } };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await client.responseFor(request);
        assert.strictEqual(response.statusCode, 200, 'did not get a 200 from proxy');

        const mbResponse = await api.get(`/imposters/${port}`),
            requests = mbResponse.body.requests;
        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].path, '/PATH');
        assert.strictEqual(requests[0].method, 'POST');
        assert.strictEqual(requests[0].body, 'BODY');
        assert.strictEqual(requests[0].headers['X-Key'], 'TRUE');
    });

    it('should return proxied result', async function () {
        const origin = {
                protocol: 'http',
                port,
                stubs: [{ responses: [{ is: { statusCode: 400, body: 'ERROR' } }] }]
            },
            proxy = {
                protocol: 'http',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `http://localhost:${origin.port}` } }] }]
            };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await client.get('/', proxy.port);

        assert.strictEqual(response.statusCode, 400);
        assert.strictEqual(response.body, 'ERROR');
    });

    it('should proxy to https', async function () {
        const origin = {
                protocol: 'https',
                port,
                stubs: [{ responses: [{ is: { statusCode: 400, body: 'ERROR' } }] }] },
            proxy = {
                protocol: 'http',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `https://localhost:${origin.port}` } }] }]
            };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await client.get('/', proxy.port);

        assert.strictEqual(response.statusCode, 400);
        assert.strictEqual(response.body, 'ERROR');
    });

    it('should update the host header to the origin server', async function () {
        const origin = {
                protocol: 'http',
                port,
                stubs: [{
                    responses: [{ is: { statusCode: 400, body: 'ERROR' } }],
                    predicates: [{ equals: { headers: { host: `localhost:${port}` } } }]
                }]
            },
            proxy = {
                protocol: 'http',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `http://localhost:${origin.port}` } }] }]
            };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await client.responseFor({
            port: proxy.port,
            path: '/',
            method: 'GET',
            headers: { host: 'www.mbtest.org' }
        });

        assert.strictEqual(response.statusCode, 400);
        assert.strictEqual(response.body, 'ERROR');
    });

    if (!airplaneMode) {
        it('should allow proxy stubs to invalid domains', async function () {
            const stub = { responses: [{ proxy: { to: 'http://invalid.domain' } }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await api.createImposter(request);

            const response = await client.get('/', port);

            assert.strictEqual(response.statusCode, 500);
            assert.strictEqual(response.body.errors[0].code, 'invalid proxy');
            assert.strictEqual(response.body.errors[0].message, 'Cannot resolve "http://invalid.domain"');
        });

        it('should gracefully deal with bad urls', async function () {
            const proxy = {
                protocol: 'http',
                port,
                stubs: [{ responses: [{ proxy: { to: '1 + 2' } }] }]
            };
            await api.createImposter(proxy);

            const response = await client.get('/', proxy.port);

            assert.strictEqual(response.statusCode, 500);
            assert.strictEqual(response.body.errors[0].code, 'invalid proxy');
            assert.strictEqual(response.body.errors[0].message, 'Unable to connect to "1 + 2"');
        });

        it('should proxy to different host', async function () {
            const proxy = {
                protocol: 'http',
                port,
                stubs: [{ responses: [{ proxy: { to: 'https://google.com' } }] }]
            };
            await api.createImposter(proxy);

            const response = await client.get('/', proxy.port);

            // sometimes 301, sometimes 302
            assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');
            // https://www.google.com.br in Brasil, google.ca in Canada, etc
            assert.ok(response.headers.location.indexOf('google.') >= 0, response.headers.location);
        });
    }

    // eslint-disable-next-line mocha/no-setup-in-describe
    ['application/octet-stream', 'audio/mpeg', 'audio/mp4', 'image/gif', 'image/jpeg', 'video/avi', 'video/mpeg'].forEach(mimeType => {
        it(`should treat ${mimeType} as binary`, async function () {
            const buffer = Buffer.from([0, 1, 2, 3]),
                origin = {
                    protocol: 'http',
                    port,
                    stubs: [{
                        responses: [{
                            is: {
                                body: buffer.toString('base64'),
                                headers: { 'content-type': mimeType },
                                _mode: 'binary'
                            }
                        }]
                    }]
                },
                proxy = {
                    protocol: 'http',
                    port: port + 1,
                    stubs: [{ responses: [{ proxy: { to: `http://localhost:${origin.port}` } }] }]
                };
            await api.createImposter(proxy);
            await api.createImposter(origin);

            const response = await client.get('/', proxy.port);

            assert.strictEqual(response.body, buffer.toString());
        });
    });

    it('should record new stubs in order in front of proxy resolver using proxyOnce mode', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${request.method} ${request.path}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
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
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/first', port);
        assert.strictEqual(first.body, '1. GET /first');

        const second = await client.del('/first', port);
        assert.strictEqual(second.body, '2. DELETE /first');

        const third = await client.get('/second', port);
        assert.strictEqual(third.body, '3. GET /second');

        const fourth = await client.get('/first', port);
        assert.strictEqual(fourth.body, '1. GET /first');

        const fifth = await client.del('/first', port);
        assert.strictEqual(fifth.body, '2. DELETE /first');

        const sixth = await client.get('/second', port);
        assert.strictEqual(sixth.body, '3. GET /second');

        const seventh = await api.del(`/imposters/${port}`);
        assert.strictEqual(seventh.body.stubs.length, 4);
    });

    it('should allow programmatic creation of predicates', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'ORIGIN' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            fn = function (config) {
                // Ignore first element; will be empty string in front of root /
                const pathParts = config.request.path.split('/').splice(1);
                // eslint-disable-next-line arrow-body-style
                return pathParts.map(part => { return { contains: { path: part } }; });
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                predicateGenerators: [{ inject: fn.toString() }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/first/third', port);
        assert.strictEqual(first.body, 'ORIGIN');

        const second = await api.get(`/imposters/${port}`),
            predicates = second.body.stubs[0].predicates;
        assert.deepEqual(predicates, [
            { contains: { path: 'first' } },
            { contains: { path: 'third' } }
        ]);
    });

    it('should record new stubs with multiple responses behind proxy resolver in proxyAlways mode', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${request.path}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        await client.get('/first', port);
        await client.get('/second', port);
        await client.get('/first', port);
        const response = await api.del(`/imposters/${port}`);

        assert.strictEqual(response.body.stubs.length, 3, JSON.stringify(response.body.stubs, null, 2));
        const stubs = response.body.stubs,
            responses = stubs.splice(1).map(stub => stub.responses.map(stubResponse => stubResponse.is.body));
        assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
    });

    it('should capture responses together in proxyAlways mode even with complex predicateGenerators', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${request.path}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyAlways',
                predicateGenerators: [{
                    matches: {
                        path: true,
                        method: true
                    },
                    caseSensitive: false
                }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        await client.get('/first', port);
        await client.get('/second', port);
        await client.get('/first', port);
        const response = await api.del(`/imposters/${port}`);

        assert.strictEqual(response.body.stubs.length, 3, JSON.stringify(response.body.stubs, null, 2));
        const stubs = response.body.stubs,
            responses = stubs.splice(1).map(stub => stub.responses.map(stubResponse => stubResponse.is.body));
        assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
    });

    it('should match entire object graphs', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${JSON.stringify(request.query)}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyOnce',
                predicateGenerators: [{ matches: { query: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/?first=1&second=2', port);
        assert.strictEqual(first.body, '1. {"first":"1","second":"2"}');

        const second = await client.get('/?first=1', port);
        assert.strictEqual(second.body, '2. {"first":"1"}');

        const third = await client.get('/?first=2&second=2', port);
        assert.strictEqual(third.body, '3. {"first":"2","second":"2"}');

        const fourth = await client.get('/?first=1&second=2', port);
        assert.strictEqual(fourth.body, '1. {"first":"1","second":"2"}');
    });

    it('should match sub-objects', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${JSON.stringify(request.query)}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyOnce',
                predicateGenerators: [{ matches: { query: { first: true } } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/?first=1&second=2', port);
        assert.strictEqual(first.body, '1. {"first":"1","second":"2"}');

        const second = await client.get('/?first=2&second=2', port);
        assert.strictEqual(second.body, '2. {"first":"2","second":"2"}');

        const third = await client.get('/?first=3&second=2', port);
        assert.strictEqual(third.body, '3. {"first":"3","second":"2"}');

        const fourth = await client.get('/?first=1&second=2&third=3', port);
        assert.strictEqual(fourth.body, '1. {"first":"1","second":"2"}');
    });

    it('should persist behaviors from origin server', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: '${SALUTATION} ${NAME}' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            shellFn = function exec () {
                console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
            },
            decorator = (request, response) => {
                response.headers['X-Test'] = 'decorated';
            },
            proxyResponse = {
                proxy: { to: `http://localhost:${originServerPort}` },
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
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);
        fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

        try {
            const first = await client.get('/mountebank', port);
            assert.strictEqual(first.body, 'Hello mountebank');
            assert.strictEqual(first.headers['x-test'], 'decorated', JSON.stringify(first.headers, null, 2));

            const second = await client.get('/world', port);
            assert.strictEqual(second.body, 'Hello mountebank');
            assert.strictEqual(second.headers['x-test'], 'decorated', JSON.stringify(second.headers, null, 2));
        }
        finally {
            fs.unlinkSync('shellTransformTest.js');
        }
    });

    it('should support adding latency to saved responses based on how long the origin server took to respond', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' }, _behaviors: { wait: 100 } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            proxyStub = { responses: [{ proxy: {
                to: `http://localhost:${originServerPort}`,
                addWaitBehavior: true
            } }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/', port);
        assert.strictEqual(first.body, 'origin server');

        const second = await api.get(`/imposters/${port}`),
            stubResponse = second.body.stubs[0].responses[0];
        assert.strictEqual(stubResponse.behaviors[0].wait, stubResponse.is._proxyResponseTime, JSON.stringify(stubResponse, null, 4));
    });

    it('should support retrieving replayable JSON with proxies removed for later playback', async function () {
        const originServerPort = port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${request.path}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        await client.get('/first', port);
        await client.get('/second', port);
        await client.get('/first', port);
        await api.del(`/imposters/${originServerPort}`);
        const response = await api.get('/imposters?replayable=true&removeProxies=true'),
            actual = JSON.stringify(response.body),
            withDateRemoved = actual.replace(/"Date":"[^"]+"/g, '"Date":"NOW"'),
            actualWithoutEphemeralData = JSON.parse(withDateRemoved);

        assert.deepEqual(actualWithoutEphemeralData, {
            imposters: [
                {
                    protocol: 'http',
                    port,
                    name: proxyRequest.name,
                    recordRequests: false,
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
    });

    it('should support returning binary data from origin server based on content encoding', async function () {
        const buffer = Buffer.from([0, 1, 2, 3]),
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
                name: 'origin'
            },
            proxyResponse = { proxy: { to: `http://localhost:${originServerPort}` } },
            proxyStub = { responses: [proxyResponse] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const response = await client.responseFor({ method: 'GET', port, path: '/', mode: 'binary' });

        assert.deepEqual(response.body.toJSON().data, [0, 1, 2, 3]);
    });

    it('should persist decorated proxy responses and only run decorator once', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            decorator = (request, response) => {
                response.body += ' decorated';
            },
            proxyStub = { responses: [{
                proxy: { to: `http://localhost:${originServerPort}` },
                _behaviors: { decorate: decorator.toString() }
            }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/', port);
        assert.strictEqual(first.body, 'origin server decorated');

        const second = await api.get(`/imposters/${port}`);
        assert.strictEqual(second.body.stubs[0].responses[0].is.body, 'origin server decorated');
    });

    if (!airplaneMode) {
        it('should support http proxy to https server', async function () {
            const proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
            await api.createImposter(proxyRequest);

            const response = await client.get('/', port);

            // Sometimes 301, sometimes 302
            assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');
            // https://www.google.com.br in Brasil, google.ca in Canada, etc
            assert.ok(response.headers.location.indexOf('google.') >= 0, response.headers.location);
        });

        it('should maintain case of headers from origin', async function () {
            const proxyStub = { responses: [{ proxy: { to: 'http://google.com' } }] },
                proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' },
                isUpperCase = header => header[0] === header[0].toUpperCase();
            await api.createImposter(proxyRequest);

            const response = await client.get('/', port);

            for (let i = 0; i < response.rawHeaders.length; i += 2) {
                assert.ok(isUpperCase(response.rawHeaders[i]), `${response.rawHeaders[i]} is not upper-case`);
            }
        });

        it('should inject proxy headers if specified', async function () {
            const proxyPort = port + 1,
                mirrorPort = port + 2,
                proxyStub = { responses: [{ proxy: { to: `http://localhost:${mirrorPort}`,
                    injectHeaders: { 'X-Forwarded-Host': 'http://www.google.com', Host: 'colbert' } } }] },
                proxyStubRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: 'proxy stub' },
                mirrorStub = { responses: [{ is: { body: '' }, _behaviors: {
                    decorate: ((request, response) => { response.headers = request.headers; }).toString() } }] },
                mirrorStubRequest = { protocol: 'http', port: mirrorPort, stubs: [mirrorStub], name: 'mirror stub' };
            await api.createImposter(mirrorStubRequest);
            await api.createImposter(proxyStubRequest);

            const response = await client.get('/', proxyPort);

            assert.equal(response.headers['x-forwarded-host'], 'http://www.google.com');
            assert.equal(response.headers.host, 'colbert');
        });
    }

    it('should not default to chunked encoding on proxied request (issue #132)', async function () {
        const originServerPort = port + 1,
            fn = (request, state, logger) => {
                function hasHeaderKey (headerKey, headers) {
                    return Object.keys(headers).some(header => header.toLowerCase() === headerKey.toLowerCase());
                }

                let encoding = '';
                logger.warn(JSON.stringify(request.headers, null, 4));
                if (hasHeaderKey('Transfer-Encoding', request.headers)) {
                    encoding = 'chunked';
                }
                else if (hasHeaderKey('Content-Length', request.headers)) {
                    encoding = 'content-length';
                }
                return {
                    body: `Encoding: ${encoding}`
                };
            },
            originServerStub = { responses: [{ inject: fn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            proxyStub = { responses: [{ proxy: {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyAlways',
                predicateGenerators: [{
                    matches: {
                        method: true,
                        path: true,
                        query: true
                    }
                }]
            } }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const response = await client.responseFor({
            method: 'PUT',
            path: '/',
            port,
            body: 'TEST',
            headers: { 'Content-Length': 4 } // needed to bypass node's implicit chunked encoding
        });

        assert.strictEqual(response.body, 'Encoding: content-length');
    });

    it('should add decorate behaviors to newly created response', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            decorator = (request, response) => {
                response.body += ' decorated';
            },
            proxyStub = { responses: [{
                proxy: { to: `http://localhost:${originServerPort}`, addDecorateBehavior: decorator.toString() }
            }] },
            proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/', port);
        assert.strictEqual(first.body, 'origin server');

        const second = await client.get('/', port);
        assert.strictEqual(second.body, 'origin server decorated');
    });

    it('DELETE /imposters/:id/requests should delete proxy stubs but not other stubs', async function () {
        const originServerPort = port + 1,
            originServerStub = { responses: [{ is: { body: 'origin server' } }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin'
            },
            firstStaticStub = {
                responses: [{ is: { body: 'first stub' } }],
                predicates: [{ equals: { body: 'fail match so we fall through to proxy' } }]
            },
            proxyStub = { responses: [{ proxy: { to: `http://localhost:${originServerPort}`, mode: 'proxyAlways' } }] },
            secondStaticStub = { responses: [{ is: { body: 'second stub' } }] },
            proxyRequest = {
                protocol: 'http',
                port,
                stubs: [firstStaticStub, proxyStub, secondStaticStub],
                name: 'proxy'
            };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const first = await client.get('/', proxyRequest.port);
        assert.strictEqual(first.body, 'origin server');

        const second = await api.del(`/imposters/${proxyRequest.port}/requests`);
        assert.strictEqual(second.statusCode, 200, JSON.stringify(second.body, null, 2));

        const third = await api.get(`/imposters/${proxyRequest.port}`);
        third.body.stubs.forEach(stub => {
            delete stub.matches;
            delete stub._links;
        });
        assert.deepEqual(third.body.stubs, proxyRequest.stubs, JSON.stringify(third.body.stubs, null, 2));
    });

    // eslint-disable-next-line mocha/no-setup-in-describe
    if (isInProcessImposter('http')) {
        it('should not add = at end of of query key missing = in original request (issue #410)', async function () {
            const http = require('http'),
                originServerPort = port + 1,
                originServer = http.createServer((request, response) => {
                    // Uxe base http library rather than imposter to get raw url
                    response.end(request.url);
                }),
                proxyStub = { responses: [{ proxy: { to: `http://localhost:${originServerPort}`, mode: 'proxyAlways' } }] },
                proxyRequest = { protocol: 'http', port, stubs: [proxyStub], name: 'proxy' };

            try {
                originServer.listen(originServerPort);
                originServer.stop = () => {
                    return new Promise(resolve => {
                        originServer.close(() => {
                            resolve({});
                        });
                    });
                };
                await api.createImposter(proxyRequest);

                const first = await client.get('/path?WSDL', port);
                assert.strictEqual(first.body, '/path?WSDL');

                const second = await client.get('/path?WSDL=', port);
                assert.strictEqual(second.body, '/path?WSDL=');
            }
            finally {
                await originServer.stop();
            }
        });
    }
});
