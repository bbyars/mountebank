'use strict';

var assert = require('assert'),
    spawn = require('child_process').spawn,
    path = require('path'),
    api = require('../api'),
    BaseHttpClient = require('../http/baseHttpClient'),
    tcp = require('./tcpClient'),
    Q = require('q'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 3000);

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

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with injections', function () {
        promiseIt('should allow javascript predicate for matching', function () {
            var stub = {
                predicates: {
                    data: { inject: "function (data) { return data.toString() === 'test'; }" },
                    request: { inject: "function (request) { return request.data.toString() === 'test'; }" }
                },
                responses: [{ is: { data: 'MATCHED' } }]
            };

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('test', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'MATCHED');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow synchronous javascript injection for responses', function () {
            var fn = "function (request) { return { data: request.data + ' INJECTED' }; }",
                stub = { responses: [{ inject: fn }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'request INJECTED');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow javascript injection to keep state between requests', function () {
            var fn = "function (request, state) {\n" +
                    "    if (!state.calls) { state.calls = 0; }\n" +
                    "    state.calls += 1;\n" +
                    "    return { data: state.calls.toString() };\n" +
                    "}",
                stub = { responses: [{ inject: fn }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), '1');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.deepEqual(response.toString(), '2');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return a 400 if injection is disallowed and inject is used', function () {
            var mbPort = port + 1,
                fn = "function (request) { return { data: 'INJECTED' }; }",
                stub = { responses: [{ inject: fn }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name },
                mbApi = BaseHttpClient.create('http');

            return nonInjectableServer('start', mbPort).then(function () {
                return mbApi.post('/imposters', request, mbPort);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors[0].code, 'invalid operation');
            }).finally(function () {
                return nonInjectableServer('stop', mbPort);
            });
        });

        promiseIt('should allow asynchronous injection', function () {
            var fn = "function (request, state, callback) {\n" +
                    "    var net = require('net'),\n" +
                    "        options = {\n" +
                    "            host: 'www.google.com',\n" +
                    "            port: 80\n" +
                    "        },\n" +
                    "        socket = net.connect(options, function () {\n" +
                    "            socket.end(request.data + '\\n');\n" +
                    "        });\n" +
                    "    socket.once('data', function (data) {\n" +
                    "        callback({ data: data });\n" +
                    "    });\n" +
                    "    // No return value!!!\n" +
                    "}",
                stub = { responses: [{ inject: fn }] };

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('GET /', port);
            }).then(function (response) {
                assert.strictEqual(response.toString().indexOf('HTTP/1.0 200'), 0);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
