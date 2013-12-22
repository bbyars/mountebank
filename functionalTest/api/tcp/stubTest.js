'use strict';

var assert = require('assert'),
    api = require('../api'),
    Q = require('q'),
    net = require('net'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000);

var tcp = {
    send: function (message, serverPort) {
        var deferred = Q.defer(),
            client = net.connect({ port: serverPort }, function () { client.write(message); });

        client.setEncoding('utf8');
        client.on('error', deferred.reject);
        client.on('data', deferred.resolve);
        return deferred.promise;
    }
};

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            var stub = {
                predicates: { data: { is: 'client' }},
                responses: [{ is: { data: 'server' } }]
            };

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function (response) {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send('client', port);
            }).then(function (response) {
                assert.strictEqual(response, 'server');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            var stub = {
                predicates: { data: { is: 'request' }},
                responses: [{ is: { data: 'first' }}, { is: { data: 'second' }}]
            };

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'first');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'second');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'first');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'second');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

//        promiseIt('should only return stubbed response if matches complex predicate', function () {
//            var stub = {
//                    responses: [{ is: { data: 'MATCH' }}],
//                    predicates: {
//                        host: { is: '/test' },
//                        query: {
//                            key: { is: 'value' }
//                        },
//                        method: { is: 'POST' },
//                        headers: {
//                            'X-One': { exists: true },
//                            'X-Two': { exists: true, is: 'Test' },
//                            'X-Three': { exists: false },
//                            'X-Four': { not: { exists: true } }
//                        },
//                        body: {
//                            startsWith: 'T',
//                            contains: 'ES',
//                            endsWith: 'T',
//                            matches: '^TEST$',
//                            is: 'TEST',
//                            exists: true
//                        }
//                    }
//                };
//
//            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
//                var options = api.merge(spec, { path: '/' });
//                return api.responseFor(options, 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong path');
//
//                var options = api.merge(spec, { path: '/test?key=different' });
//                return api.responseFor(options, 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong query');
//
//                var options = api.merge(spec, { method: 'PUT' });
//                return api.responseFor(options, 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong method');
//
//                var options = api.merge(spec, {});
//                delete options.headers['X-One'];
//                return api.responseFor(options, 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; missing header');
//
//                var options = api.merge(spec, { headers: { 'X-Two': 'Testing' }});
//                return api.responseFor(options, 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for header');
//
//                return api.responseFor(api.merge(spec, {}), 'TESTing');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for body');
//
//                return api.responseFor(api.merge(spec, {}), 'TEST');
//            }).then(function (response) {
//                assert.strictEqual(response.statusCode, 400, 'should have matched');
//
//                return Q(true);
//            }).finally(function () {
//                return api.del('/imposters/' + port);
//            });
//        });

        promiseIt('should allow proxy stubs', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                stub = { responses: [{ proxy: { host: 'localhost', port:  proxyPort } }] };

            return api.post('/imposters', { protocol: 'tcp', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] });
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'PROXIED');
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

//        promiseIt('should allow proxy stubs to invalid hosts', function () {
//            var stub = { responses: [{ proxy: { host: 'remotehost', port: 8000 } }] };
//
//            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function () {
//            }).then(function () {
//                return tcp.send('request', port);
//            }).then(function (response) {
//                assert.deepEqual(JSON.parse(response), { errors: [{
//                    code: 'invalid proxy',
//                    message: 'Cannot resolve remotehost'
//                }]});
//            }).finally(function () {
//                return api.del('/imposters/' + port);
//            });
//        });

        promiseIt('should allow proxyOnce behavior', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                stub = { responses: [{ proxyOnce: { host: 'localhost', port: proxyPort } }] };

            return api.post('/imposters', { protocol: 'tcp', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] });
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'PROXIED');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response, 'PROXIED');

                return api.get('/imposters/' + proxyPort);
            }).then(function (response) {
                assert.strictEqual(response.body.requests.length, 1);
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should save proxyOnce state between stub creations', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                stub = { responses: [{ proxyOnce: { host: 'localhost', port: proxyPort } }] };

            return api.post('/imposters', { protocol: 'tcp', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] });
            }).then(function () {
                return tcp.send('request', port);
            }).then(function () {
                return api.del('/imposters/' + proxyPort);
            }).then(function () {
                return api.del('/imposters/' + port);
            }).then(function (response) {
                // replay the imposter body without change, and with the proxy shut down
                return api.post('/imposters', response.body);
            }).then(function (response) {
                assert.strictEqual(201, response.statusCode, JSON.stringify(response.body));

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual('PROXIED', response);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
