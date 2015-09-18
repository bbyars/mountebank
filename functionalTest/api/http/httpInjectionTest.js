'use strict';

var assert = require('assert'),
    api = require('../api'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../../mb').create(port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        if (isWindows) {
            // slower process startup time because Windows
            this.timeout(timeout*2);
        }
        else {
            this.timeout(timeout);
        }

        describe('POST /imposters with injections', function () {
            promiseIt('should allow javascript predicate for matching', function () {
                // note the lower-case keys for headers!!!
                var fn = function (request) { return request.path === '/test';},
                    stub = {
                        predicates: [{ inject: fn.toString() }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    var spec = {
                            path: '/test?key=value',
                            port: port,
                            method: 'POST',
                            headers: {
                                'X-Test': 'test header',
                                'Content-Type': 'text/plain'
                            },
                            body: 'BODY'
                        };
                    return client.responseFor(spec);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'MATCHED');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should give a 400 on a bad predicate injection', function () {
                var stub = {
                        predicates: [{ inject: 'return true;' }],
                        responses: [{ is: { body: 'MATCHED' } }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, JSON.stringify(response.body));
                    assert.strictEqual(response.body.errors[0].data, 'invalid predicate injection');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should allow synchronous javascript injection for responses', function () {
                var fn = function (request) { return { body: request.method + ' INJECTED' }; },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'GET INJECTED');
                    assert.strictEqual(response.statusCode, 200);
                    assert.strictEqual(response.headers.connection, 'close');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should give a 400 on a bad response injection', function () {
                var fn = function () { throw('BOOM'); },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, JSON.stringify(response.body));
                    assert.strictEqual(response.body.errors[0].message, 'invalid response injection');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should allow javascript injection to keep state between requests', function () {
                var fn = function (request, state) {
                            if (!state.calls) { state.calls = 0; }
                            state.calls += 1;
                            return { body: state.calls.toString() };
                        },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '1');

                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(response.body, '2');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should return a 400 if injection is disallowed and inject is used', function () {
                var fn = function (request) { return { body: request.method + ' INJECTED' }; },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return mb.start().then(function () {
                    return mb.post('/imposters', request);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                }).finally(function () {
                    return mb.stop();
                });
            });

            if (process.env.MB_AIRPLANE_MODE !== 'true') {
                promiseIt('should allow asynchronous injection', function () {
                    var fn = function (request, state, logger, callback) {
                            var http = require('http'),
                                options = {
                                    method: request.method,
                                    hostname: 'www.google.com',
                                    port: 80,
                                    path: request.path,
                                    headers: request.headers
                                },
                                httpRequest = http.request(options, function (response) {
                                    response.body = '';
                                    response.setEncoding('utf8');
                                    response.on('data', function (chunk) {
                                        response.body += chunk;
                                    });
                                    response.on('end', function () {
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
                        stub = {responses: [{inject: fn.toString()}]},
                        request = {protocol: protocol, port: port, stubs: [stub], name: this.name};

                    return api.post('/imposters', request).then(function (response) {
                        assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                        return client.get('', port);
                    }).then(function (response) {
                        // sometimes 301, sometimes 302
                        assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');

                        // https://www.google.com.br in Brasil, etc
                        assert.ok(response.headers.location.indexOf('google.com') >= 0, response.headers.location);
                    }).finally(function () {
                        return api.del('/imposters');
                    });
                });
            }
        });
    });
});
