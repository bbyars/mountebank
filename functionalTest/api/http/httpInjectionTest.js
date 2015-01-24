'use strict';

var assert = require('assert'),
    spawn = require('child_process').spawn,
    path = require('path'),
    api = require('../api'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('./baseHttpClient'),
    Q = require('q'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 3000);

function nonInjectableServer (command, mbPort) {
    var deferred = Q.defer(),
        calledDone = false,
        mbPath = path.normalize(__dirname + '/../../../bin/mb'),
        options = [command, '--port', mbPort, '--pidfile', 'imposter-test.pid'],
        mb;

    if (isWindows) {
        options.unshift(mbPath);
        mb = spawn('node', options);
    }
    else {
        mb = spawn(mbPath, options);
    }

    ['stdout', 'stderr'].forEach(function (stream) {
        mb[stream].on('data', function () {
            if (!calledDone) {
                calledDone = true;
                deferred.resolve();
            }
        });
    });
    return deferred.promise;
}

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

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
                        }
                    };
                    return client.responseFor(spec, 'BODY');
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
                var mbPort = port + 1,
                    fn = function (request) { return { body: request.method + ' INJECTED' }; },
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name },
                    mbApi = BaseHttpClient.create('http');

                return nonInjectableServer('start', mbPort).then(function () {
                    return mbApi.post('/imposters', request, mbPort);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                }).finally(function () {
                    return nonInjectableServer('stop', mbPort);
                });
            });

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
                    stub = { responses: [{ inject: fn.toString() }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    return client.get('', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 302);
                    assert.strictEqual(response.headers.location, 'http://www.google.com/');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });
        });
    });
});
