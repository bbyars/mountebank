'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        describe('POST /imposters with injections', function () {
            promiseIt('should allow javascript predicate for matching (old interface)', function () {
                // note the lower-case keys for headers!!!
                const fn = request => request.path === '/test',
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    const spec = {
                        path: '/test?key=value',
                        port,
                        method: 'POST',
                        headers: {
                            'X-Test': 'test header',
                            'Content-Type': 'text/plain'
                        },
                        body: 'BODY'
                    };
                    return client.responseFor(spec);
                }).then(response => {
                    assert.strictEqual(response.body, 'MATCHED');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow javascript predicate for matching', function () {
                // note the lower-case keys for headers!!!
                const fn = config => config.request.path === '/test',
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    const spec = {
                        path: '/test?key=value',
                        port,
                        method: 'POST',
                        headers: {
                            'X-Test': 'test header',
                            'Content-Type': 'text/plain'
                        },
                        body: 'BODY'
                    };
                    return client.responseFor(spec);
                }).then(response => {
                    assert.strictEqual(response.body, 'MATCHED');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should not validate a bad predicate injection', function () {
                const stub = {
                        predicates: [{ inject: 'return true;' }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow synchronous javascript injection for responses (old interface)', function () {
                const fn = request => ({ body: `${request.method} INJECTED` }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request)
                    .then(() => client.get('/', port))
                    .then(response => {
                        assert.strictEqual(response.body, 'GET INJECTED');
                        assert.strictEqual(response.statusCode, 200);
                        assert.strictEqual(response.headers.connection, 'close');
                    })
                    .finally(() => api.del('/imposters'));
            });

            promiseIt('should allow synchronous javascript injection for responses', function () {
                const fn = config => ({ body: `${config.request.method} INJECTED` }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request)
                    .then(() => client.get('/', port))
                    .then(response => {
                        assert.strictEqual(response.body, 'GET INJECTED');
                        assert.strictEqual(response.statusCode, 200);
                        assert.strictEqual(response.headers.connection, 'close');
                    })
                    .finally(() => api.del('/imposters'));
            });

            promiseIt('should not validate a bad response injection', function () {
                const fn = () => { throw new Error('BOOM'); },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow javascript injection to keep state between requests (old interface)', function () {
                const fn = (request, state) => {
                        if (!state.calls) { state.calls = 0; }
                        state.calls += 1;
                        return { body: state.calls.toString() };
                    },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, '1');

                    return client.get('/', port);
                }).then(response => {
                    assert.deepEqual(response.body, '2');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow javascript injection to keep state between requests', function () {
                const fn = config => {
                        if (!config.state.calls) { config.state.calls = 0; }
                        config.state.calls += 1;
                        return { body: config.state.calls.toString() };
                    },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, '1');

                    return client.get('/', port);
                }).then(response => {
                    assert.deepEqual(response.body, '2');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should share state with predicate and response injection (old interface)', function () {
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

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'INJECT');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'INJECT');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'IS');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should share state with predicate and response injection', function () {
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

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'INJECT');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'INJECT');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'IS');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow access to the global process object', function () {
                // https://github.com/bbyars/mountebank/issues/134
                const fn = () => ({ body: process.env.USER || 'test' }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, process.env.USER || 'test');
                }).finally(() => api.del('/imposters'));
            });

            if (process.env.MB_AIRPLANE_MODE !== 'true') {
                promiseIt('should allow asynchronous injection', function () {
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

                    return api.post('/imposters', request).then(response => {
                        assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                        return client.get('/', port);
                    }).then(response => {
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
                    }).finally(() => api.del('/imposters'));
                });
            }
        });
    });
});
