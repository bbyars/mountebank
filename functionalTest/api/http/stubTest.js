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

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            var stub = {
                    predicates: { path: { is: '/test' }},
                    responses: [{
                        is: {
                            statusCode: 400,
                            headers: { 'X-Test': 'test header' },
                            body: 'test body'
                        }
                    }]
                };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201);

                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'test body');
                assert.strictEqual(response.headers['x-test'], 'test header');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            var stub = {
                    predicates: { path: { is: '/test' }},
                    responses: [{ is: { statusCode: 400 }}, { is: { statusCode: 405 }}]
                };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);

                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 405);

                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);

                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 405);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should only return stubbed response if matches complex predicate', function () {
            var spec = {
                    path: '/test',
                    port: port,
                    method: 'POST',
                    headers: {
                        'X-One': 'Test',
                        'X-Two': 'Test',
                        'Content-Type': 'text/plain'
                    }
                },
                stub = {
                    path: '/test',
                    responses: [{ is: { statusCode: 400 }}],
                    predicates: {
                        path: { is: '/test' },
                        method: { is: 'POST' },
                        headers: {
                            exists: { 'X-One': true, 'X-Two': true },
                            is: { 'X-Two': 'Test' },
                            not: { exists: { 'X-Three': true }}
                        },
                        body: {
                            startsWith: 'T',
                            contains: 'ES',
                            endsWith: 'T',
                            matches: '^TEST$',
                            is: 'TEST',
                            exists: true
                        }
                    }
                };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
                var options = api.merge(spec, { path: '/' });
                return api.responseFor(options, 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong path');

                var options = api.merge(spec, { method: 'PUT' });
                return api.responseFor(options, 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong method');

                var options = api.merge(spec, {});
                delete options.headers['X-One'];
                return api.responseFor(options, 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; missing header');

                var options = api.merge(spec, { headers: { 'X-Two': 'Testing' }});
                return api.responseFor(options, 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for header');

                return api.responseFor(api.merge(spec, {}), 'TESTing');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for body');

                return api.responseFor(api.merge(spec, {}), 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400, 'should have matched');

                return Q(true);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow javascript predicate for matching', function () {
            var stub = {
                    predicates: {
                        path: { inject: "function (path) { return path === '/test'; }" },
                        method: { inject: "function (method) { return method === 'POST'; }"},
                                                                // note the lower-case key!!!
                        headers: { inject: "function (headers) { return headers['x-test'] === 'test header'; }"},
                        body: { inject: "function (body) { return body === 'BODY'; }"},
                        request: { inject: "function (request) { return request.path === '/test'; }"}
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

        promiseIt('should allow proxy stubs', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
                stub = { responses: [{ proxy: 'http://localhost:' + proxyPort }] };

            return api.post('/imposters', { protocol: 'http', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] });
            }).then(function () {
                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow proxyOnce behavior', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
                stub = { responses: [{ proxyOnce: 'http://localhost:' + proxyPort }] };

            return api.post('/imposters', { protocol: 'http', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] });
            }).then(function () {
                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');

                return api.get('/imposters/' + proxyPort);
            }).then(function (response) {
                assert.strictEqual(response.body.requests.length, 1);
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow javascript injection', function () {
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

        // Struggling to get the next two tests to pass:

//        it('should not crash due to bad javascript injection', function (done) {
//            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
//                var fn = "function (request) { return { body: 1 }; }";
//                return api.post(response.getLinkFor('stubs'), { responses: [{ inject: fn }] });
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
//
//                return api.get('/', port);
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 500);
//                assert.strictEqual(response.body, '');
//
//                return Q(true);
//            }).done(doneCallback(done), doneErrback(done));
//        });

//        it('should allow asynchronous injection', function (done) {
//            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
//                var fn = "function () {\n" +
//                            "process.nextTick(function () {\n" +
//                                "return { body: 'INJECTED' };\n" +
//                            "});\n" +
//                         "}";
//                return api.post(response.getLinkFor('stubs'), { responses: [{ inject: fn }] });
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
//
//                return api.get('/', port);
//            }).then(function (response) {
//                assert.strictEqual(response.body, 'INJECTED');
//
//                return Q(true);
//            }).done(doneCallback(done), doneErrback(done));
//        });
    });
});
