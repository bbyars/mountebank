'use strict';

var assert = require('assert'),
    api = require('../api'),
    Q = require('q'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1;

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
                    path: '/test?key=value',
                    port: port,
                    method: 'POST',
                    headers: {
                        'X-One': 'Test',
                        'X-Two': 'Test',
                        'Content-Type': 'text/plain'
                    }
                },
                stub = {
                    responses: [{ is: { statusCode: 400 }}],
                    predicates: {
                        path: { is: '/test' },
                        query: {
                            key: { is: 'value' }
                        },
                        method: { is: 'POST' },
                        headers: {
                            'X-One': { exists: true },
                            'X-Two': { exists: true, is: 'Test' },
                            'X-Three': { exists: false },
                            'X-Four': { not: { exists: true } }
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

                var options = api.merge(spec, { path: '/test?key=different' });
                return api.responseFor(options, 'TEST');
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong query');

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

        promiseIt('should allow proxy stubs to invalid domains', function () {
            var stub = { responses: [{ proxy: 'http://invalid.domain' }] };

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
            }).then(function () {
                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 500);
                assert.deepEqual(response.body, { errors: [{
                    code: 'invalid proxy',
                    message: 'Cannot resolve http://invalid.domain'
                }]});
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

        promiseIt('should save proxyOnce state between stub creations', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
                stub = { responses: [{ proxyOnce: 'http://localhost:' + proxyPort }] };

            return api.post('/imposters', { protocol: 'http', port: proxyPort, stubs: [proxyStub] }).then(function () {
                return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] });
            }).then(function () {
                return api.get('/', port);
            }).then(function () {
                return api.del('/imposters/' + proxyPort);
            }).then(function () {
                return api.del('/imposters/' + port);
            }).then(function (response) {
                // replay the imposter body without change, and with the proxy shut down
                return api.post('/imposters', response.body);
            }).then(function (response) {
                assert.strictEqual(201, response.statusCode, JSON.stringify(response.body));

                return api.get('/', port);
            }).then(function (response) {
                assert.strictEqual('PROXIED', response.body);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
