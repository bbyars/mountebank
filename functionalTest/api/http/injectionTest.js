'use strict';

var assert = require('assert'),
    spawn = require('child_process').spawn,
    path = require('path'),
    api = require('../api'),
    Q = require('q'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1;

function nonInjectableServer (command, port) {
    var deferred = Q.defer(),
        calledDone = false,
        mbPath = path.normalize(__dirname + '/../../../bin/mb'),
        mb = spawn(mbPath, [command, '--port', port, '--pidfile', 'imposter-test.pid']);

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

describe('http imposter', function () {

    describe('POST /imposters with injections', function () {
        promiseIt('should allow javascript predicate for matching', function () {
            var stub = {
                predicates: {
                    path: { inject: "function (path) { return path === '/test'; }" },
                    method: { inject: "function (method) { return method === 'POST'; }" },
                                                            // note the lower-case key!!!
                    headers: { inject: "function (headers) { return headers['x-test'] === 'test header'; }" },
                    body: { inject: "function (body) { return body === 'BODY'; }" },
                    request: { inject: "function (request) { return request.path === '/test'; }" }
                },
                responses: [{ is: { body: 'MATCHED' } }]
            };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var spec = {
                    path: '/test',
                    port: port,
                    method: 'POST',
                    headers: {
                        'X-Test': 'test header',
                        'Content-Type': 'text/plain'
                    }
                };
                return api.responseFor(spec, 'BODY');
            }).then(function (response) {
                assert.strictEqual(response.body, 'MATCHED');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow synchronous javascript injection for responses', function () {
            var fn = "function (request) { return { body: request.method + ' INJECTED' }; }",
                stub = { responses: [{ inject: fn }] };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'GET INJECTED');
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow javascript injection to keep state between requests', function () {
            var fn = "function (request, state) {\n" +
                    "    if (!state.calls) { state.calls = 0; }\n" +
                    "    state.calls += 1;\n" +
                    "    return { body: state.calls.toString() };\n" +
                    "}",
                stub = { responses: [{ inject: fn }] };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, '1');

                return api.get('/', port);
            }).then(function (response) {
                assert.deepEqual(response.body, '2');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return a 400 if injection is disallowed and inject is used', function () {
            var mbPort = port + 1,
                fn = "function (request) { return { body: request.method + ' INJECTED' }; }",
                stub = { responses: [{ inject: fn }] };

            return nonInjectableServer('start', mbPort).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }, mbPort);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors[0].code, 'invalid operation');
            }).finally(function () {
                return nonInjectableServer('stop', mbPort);
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            var fn = "function (request, state, callback) {\n" +
                    "    var http = require('http'),\n" +
                    "        options = {\n" +
                    "            method: request.method,\n" +
                    "            hostname: 'www.google.com',\n" +
                    "            port: 80,\n" +
                    "            path: request.path,\n" +
                    "            headers: request.headers\n" +
                    "        },\n" +
                    "        httpRequest = http.request(options, function (response) {\n" +
                    "            response.body = '';\n" +
                    "            response.setEncoding('utf8');\n" +
                    "            response.on('data', function (chunk) {\n" +
                    "                response.body += chunk;\n" +
                    "            });\n" +
                    "            response.on('end', function () {\n" +
                    "                callback(response);\n" +
                    "            });\n" +
                    "        });\n" +
                    "    httpRequest.end();\n" +
                    "    // No return value!!!\n" +
                    "}",
                stub = { responses: [{ inject: fn }] };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return api.get('', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 302);
                assert.strictEqual(response.headers.location, 'http://www.google.com/');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
