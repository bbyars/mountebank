'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        afterEach(async function () {
            await api.del('/imposters');
        });

        describe('POST /imposters with injections', function () {
            it('should allow javascript predicate for matching (old interface)', async function () {
                // note the lower-case keys for headers!!!
                const fn = request => request.path === '/test',
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const spec = {
                        path: '/test?key=value',
                        port,
                        method: 'POST',
                        headers: {
                            'X-Test': 'test header',
                            'Content-Type': 'text/plain'
                        },
                        body: 'BODY'
                    },
                    response = await client.responseFor(spec);

                assert.strictEqual(response.body, 'MATCHED');
            });

            it('should allow javascript predicate for matching', async function () {
                // note the lower-case keys for headers!!!
                const fn = config => config.request.path === '/test',
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const spec = {
                        path: '/test?key=value',
                        port,
                        method: 'POST',
                        headers: {
                            'X-Test': 'test header',
                            'Content-Type': 'text/plain'
                        },
                        body: 'BODY'
                    },
                    response = await client.responseFor(spec);

                assert.strictEqual(response.body, 'MATCHED');
            });

            it('should allow changing state in predicate injection (issue #495)', async function () {
                const fn = config => {
                        config.state.requests = config.state.requests || 0;
                        config.state.requests += 1;
                        return config.state.requests === 2;
                    },
                    matchedStub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    unmatchedStub = {
                        responses: [{ is: { body: 'UNMATCHED' } }]
                    },
                    request = { protocol, port, stubs: [matchedStub, unmatchedStub] };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, 'UNMATCHED');

                const second = await client.get('/', port);
                assert.strictEqual(second.body, 'MATCHED');
            });

            it('should not validate a bad predicate injection', async function () {
                const stub = {
                        predicates: [{ inject: 'return true;' }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };

                const response = await api.createImposter(request);

                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            });

            it('should allow synchronous javascript injection for responses (old interface)', async function () {
                const fn = request => ({ body: `${request.method} INJECTED` }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'GET INJECTED');
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');
            });

            it('should allow synchronous javascript injection for responses', async function () {
                const fn = config => ({ body: `${config.request.method} INJECTED` }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'GET INJECTED');
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');
            });

            it('should not validate a bad response injection', async function () {
                const fn = () => { throw new Error('BOOM'); },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                const response = await api.createImposter(request);

                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            });

            it('should allow javascript injection to keep state between requests (old interface)', async function () {
                const fn = (request, state) => {
                        if (!state.calls) { state.calls = 0; }
                        state.calls += 1;
                        return { body: state.calls.toString() };
                    },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, '1');

                const second = await client.get('/', port);
                assert.deepEqual(second.body, '2');
            });

            it('should allow javascript injection to keep state between requests', async function () {
                const fn = config => {
                        if (!config.state.calls) { config.state.calls = 0; }
                        config.state.calls += 1;
                        return { body: config.state.calls.toString() };
                    },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, '1');

                const second = await client.get('/', port);
                assert.deepEqual(second.body, '2');
            });

            it('should share state with predicate and response injection (old interface)', async function () {
                const responseFn = (request, injectState, logger, callback, imposterState) => {
                        imposterState.calls = imposterState.calls || 0;
                        imposterState.calls += 1;
                        return { body: 'INJECT' };
                    },
                    predicateFn = (request, logger, state) => {
                        const numCalls = state.calls || 0;
                        return numCalls > 1;
                    },
                    stubs = [
                        {
                            predicates: [{ // Compound predicate because previous bug didn't pass state in and/or
                                and: [
                                    { inject: predicateFn.toString() },
                                    { equals: { path: '/' } }
                                ]
                            }],
                            responses: [{ is: { body: 'IS' } }]
                        },
                        {
                            responses: [{ inject: responseFn.toString() }]
                        }
                    ],
                    request = { protocol, port, stubs };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, 'INJECT');

                const second = await client.get('/', port);
                assert.strictEqual(second.body, 'INJECT');

                const third = await client.get('/', port);
                assert.strictEqual(third.body, 'IS');
            });

            it('should share state with predicate and response injection', async function () {
                const responseFn = config => {
                        config.state.calls = config.state.calls || 0;
                        config.state.calls += 1;
                        return { body: 'INJECT' };
                    },
                    predicateFn = config => {
                        const numCalls = config.state.calls || 0;
                        return numCalls > 1;
                    },
                    stubs = [
                        {
                            predicates: [{ // Compound predicate because previous bug didn't pass state in and/or
                                and: [
                                    { inject: predicateFn.toString() },
                                    { equals: { path: '/' } }
                                ]
                            }],
                            responses: [{ is: { body: 'IS' } }]
                        },
                        {
                            responses: [{ inject: responseFn.toString() }]
                        }
                    ],
                    request = { protocol, port, stubs };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, 'INJECT');

                const second = await client.get('/', port);
                assert.strictEqual(second.body, 'INJECT');

                const third = await client.get('/', port);
                assert.strictEqual(third.body, 'IS');
            });

            it('should allow access to the global process object', async function () {
                // https://github.com/bbyars/mountebank/issues/134
                const fn = () => ({ body: process.env.USER || 'test' }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, process.env.USER || 'test');
            });

            // eslint-disable-next-line mocha/no-setup-in-describe
            if (process.env.MB_AIRPLANE_MODE !== 'true') {
                it('should allow asynchronous injection', async function () {
                    const fn = (request, state, logger, callback) => {
                            const http = require('http'),
                                options = {
                                    method: request.method,
                                    hostname: 'www.google.com',
                                    port: 80,
                                    path: request.path,
                                    headers: request.headers
                                };

                            options.headers.host = options.hostname;
                            const httpRequest = http.request(options, response => {
                                response.body = '';
                                response.setEncoding('utf8');
                                response.on('data', chunk => {
                                    response.body += chunk;
                                });
                                response.on('end', () => {
                                    callback({
                                        statusCode: response.statusCode,
                                        headers: response.headers,
                                        body: response.body
                                    });
                                });
                            });
                            httpRequest.end();
                            // No return value!!!
                        },
                        stub = { responses: [{ inject: fn.toString() }] },
                        request = { protocol, port, stubs: [stub] };
                    await api.createImposter(request);

                    const response = await client.get('/', port);

                    // sometimes 301, sometimes 302
                    // 200 on new Mac with El Capitan?
                    assert.ok(response.statusCode <= 302, response.statusCode);
                    if (response.statusCode === 200) {
                        assert.ok(response.body.indexOf('google') >= 0, response.body);
                    }
                    else {
                        // google.com.br in Brasil, google.ca in Canada, etc
                        assert.ok(response.headers.location.indexOf('google.') >= 0, response.headers.location);
                    }
                });
            }
        });
    });
});
