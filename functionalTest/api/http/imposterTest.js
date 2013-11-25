'use strict';

var assert = require('assert'),
    spawn = require('child_process').spawn,
    path = require('path'),
    api = require('../api'),
    Q = require('q'),
    port = api.port + 1;

function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

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

    afterEach(function (done) {
        api.del('/imposters/' + port).done(doneCallback(done), done);
    });

    describe('GET /imposters/:id', function () {
        it('should return 404 if imposter has not been created', function (done) {
            api.get('/imposters/3535').then(function (response) {
                assert.strictEqual(response.statusCode, 404);

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        it('should shutdown server at that port', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                return api.del(response.getLinkFor('self'));
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'Delete failed');

                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should return a 200 even if the server does not exist', function (done) {
            api.del('/imposters/9999').then(function (response) {
                assert.strictEqual(response.statusCode, 200);

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('GET /imposters/:id/requests', function () {
        it('should provide access to all requests', function (done) {
            var requestsPath;

            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                requestsPath = response.getLinkFor('requests');
                return api.get('/first', port);
            }).then(function () {
                return api.get('/second', port);
            }).then(function () {
                return api.get(requestsPath);
            }).then(function (response) {
                var requests = response.body.requests.map(function (request) {
                    return request.path;
                });
                assert.deepEqual(requests, ['/first', '/second']);

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });

    describe('POST /imposters/:id/stubs', function () {
        it('should return stubbed response', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
                        predicates: { path: { is: '/test' }},
                        responses: [{
                            is: {
                                statusCode: 400,
                                headers: { 'X-Test': 'test header' },
                                body: 'test body'
                            }
                        }]
                    };

                return api.post(stubsPath, stubBody);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);

                return api.get('/test', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'test body');
                assert.strictEqual(response.headers['x-test'], 'test header');

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow a sequence of stubs as a circular buffer', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
                        predicates: { path: { is: '/test' }},
                        responses: [{ is: { statusCode: 400 }}, { is: { statusCode: 405 }}]
                    };

                return api.post(stubsPath, stubBody);
            }).then(function () {
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

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should only return stubbed response if matches complex predicate', function (done) {
            var spec = {
                    path: '/test',
                    port: port,
                    method: 'POST',
                    headers: {
                        'X-One': 'Test',
                        'X-Two': 'Test',
                        'Content-Type': 'text/plain'
                    }
                };

            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
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

                return api.post(stubsPath, stubBody);
            }).then(function () {
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
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow javascript predicate for matching', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var stubsPath = response.getLinkFor('stubs'),
                    stubBody = {
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

                return api.post(stubsPath, stubBody);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

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

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow proxy stubs', function (done) {
            var proxyPort = port + 1;

            api.post('/imposters', { protocol: 'http', port: proxyPort }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return api.post(response.getLinkFor('stubs'), { responses: [{ is: { body: 'PROXIED' } }] });
            }).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                var stub = { responses: [{ proxy: 'http://localhost:' + proxyPort }] };
                return api.post(response.getLinkFor('stubs'), stub);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');

                return api.del('/imposters/' + proxyPort);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow proxyOnce behavior', function (done) {
            var proxyPort = port + 1;

            api.post('/imposters', { protocol: 'http', port: proxyPort }).then(function (response) {
                return api.post(response.getLinkFor('stubs'), { responses: [{ is: { body: 'PROXIED' } }] });
            }).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                var stub = { responses: [{ proxyOnce: 'http://localhost:' + proxyPort }] };
                return api.post(response.getLinkFor('stubs'), stub);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'PROXIED');

                return api.get('/imposters/' + proxyPort + '/requests');
            }).then(function (response) {
                assert.strictEqual(response.body.requests.length, 1);

                return Q(true);
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow javascript injection', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var fn = "function (request) { return { body: request.method + ' INJECTED' }; }";
                return api.post(response.getLinkFor('stubs'), { responses: [{ inject: fn }] });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, 'GET INJECTED');
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should allow javascript injection to keep state between requests', function (done) {
            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                var fn = "function (request, state) {\n" +
                            "if (!state.calls) { state.calls = 0; }\n" +
                            "state.calls += 1;\n" +
                            "return { body: state.calls.toString() };\n" +
                         "}";
                return api.post(response.getLinkFor('stubs'), { responses: [{ inject: fn }] });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.body, '1');

                return api.get('/', port);
            }).then(function (response) {
                assert.deepEqual(response.body, '2');

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should return a 400 if injection is disallowed and inject is used', function (done) {
            var mbPort = port + 1;

            nonInjectableServer('start', mbPort).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port }, mbPort);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var fn = "function (request) { return { body: request.method + ' INJECTED' }; }";
                return api.post(response.getLinkFor('stubs'), { responses: [{ inject: fn }] }, mbPort);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors[0].code, 'invalid operation');

                return Q(true);
            }).finally(function () {
                return nonInjectableServer('stop', mbPort);
            }).done(doneCallback(done), doneErrback(done));
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

    describe('GET /imposters/:id/stubs', function () {
        it('should return list of stubs in order', function (done) {
            var stubsPath;

            api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                stubsPath = response.getLinkFor('stubs');
                return api.post(stubsPath, { responses: [{ is: { body: '1' }}]});
            }).then(function () {
                return api.post(stubsPath, { responses: [{ is: { body: '2' }}]});
            }).then(function () {
                return api.get(stubsPath);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body, { stubs: [
                    { responses: [{ is: { body: '1' } }] },
                    { responses: [{ is: { body: '2' } }] }
                ]});

                return Q(true);
            }).done(doneCallback(done), doneErrback(done));
        });
    });
});
