'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    requestName = 'some request name';

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, () => {
        describe('POST /imposters with injections', () => {
            promiseIt('should allow javascript predicate for matching', () => {
                // note the lower-case keys for headers!!!
                const fn = request => request.path === '/test',
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub], name: requestName };

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

            promiseIt('should not validate a bad predicate injection', () => {
                const stub = {
                        predicates: [{ inject: 'return true;' }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow synchronous javascript injection for responses', () => {
                const fn = request => ({ body: `${request.method} INJECTED` }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return api.post('/imposters', request).then(() => client.get('/', port)).then(response => {
                    assert.strictEqual(response.body, 'GET INJECTED');
                    assert.strictEqual(response.statusCode, 200);
                    assert.strictEqual(response.headers.connection, 'close');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should not validate a bad response injection', () => {
                const fn = () => { throw new Error('BOOM'); },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should allow javascript injection to keep state between requests', () => {
                const fn = (request, state) => {
                        if (!state.calls) { state.calls = 0; }
                        state.calls += 1;
                        return { body: state.calls.toString() };
                    },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

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

            promiseIt('should allow access to the global process object', () => {
                // https://github.com/bbyars/mountebank/issues/134
                const fn = () => ({ body: process.env.USER || 'test' }),
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol, port, stubs: [stub], name: requestName };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, process.env.USER || 'test');
                }).finally(() => api.del('/imposters'));
            });

            if (process.env.MB_AIRPLANE_MODE !== 'true') {
                promiseIt('should allow asynchronous injection', () => {
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
                        request = { protocol, port, stubs: [stub], name: requestName };

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
    }).timeout(timeout);
});
