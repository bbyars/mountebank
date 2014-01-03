'use strict';

var assert = require('assert'),
    api = require('../api'),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000),
    helpers = require('../../../src/util/helpers');

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters with stubs', function () {
            promiseIt('should return stubbed response', function () {
                var stub = {
                        predicates: { path: { is: '/test' } },
                        responses: [{
                            is: {
                                statusCode: 400,
                                headers: { 'X-Test': 'test header' },
                                body: 'test body'
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);

                    return client.get('/test', port);
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
                        predicates: { path: { is: '/test' } },
                        responses: [{ is: { statusCode: 400 }}, { is: { statusCode: 405 } }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);

                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 405);

                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);

                    return client.get('/test', port);
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
                        responses: [{ is: { statusCode: 400 } }],
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
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    var options = helpers.merge(spec, { path: '/' });
                    return client.responseFor(options, 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong path');

                    var options = helpers.merge(spec, { path: '/test?key=different' });
                    return client.responseFor(options, 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong query');

                    var options = helpers.merge(spec, { method: 'PUT' });
                    return client.responseFor(options, 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong method');

                    var options = helpers.merge(spec, {});
                    delete options.headers['X-One'];
                    return client.responseFor(options, 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; missing header');

                    var options = helpers.merge(spec, { headers: { 'X-Two': 'Testing' }});
                    return client.responseFor(options, 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for header');

                    return client.responseFor(helpers.merge(spec, {}), 'TESTing');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for body');

                    return client.responseFor(helpers.merge(spec, {}), 'TEST');
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, 'should have matched');
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should allow proxy stubs', function () {
                var proxyPort = port + 1,
                    proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
                    proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                    stub = { responses: [{ proxy: 'http://localhost:' + proxyPort }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name + ' MAIN' };

                return api.post('/imposters', proxyRequest).then(function () {
                    return api.post('/imposters', request);
                }).then(function () {
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'PROXIED');
                }).finally(function () {
                    return api.del('/imposters/' + proxyPort);
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should allow proxy stubs to invalid domains', function () {
                var stub = { responses: [{ proxy: 'http://invalid.domain' }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                }).then(function () {
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 500);
                    assert.deepEqual(response.body, { errors: [{
                        code: 'invalid proxy',
                        message: 'Cannot resolve "http://invalid.domain"'
                    }]});
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should allow proxyOnce behavior', function () {
                var proxyPort = port + 1,
                    proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
                    proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                    stub = { responses: [{ proxyOnce: 'http://localhost:' + proxyPort }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name + ' MAIN' };

                return api.post('/imposters', proxyRequest).then(function () {
                    return api.post('/imposters', request);
                }).then(function () {
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'PROXIED');

                    return client.get('/', port);
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
                    proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                    stub = { responses: [{ proxyOnce: 'http://localhost:' + proxyPort }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name + ' MAIN' };

                return api.post('/imposters', proxyRequest).then(function () {
                    return api.post('/imposters', request);
                }).then(function () {
                    return client.get('/', port);
                }).then(function () {
                    return api.del('/imposters/' + proxyPort);
                }).then(function () {
                    return api.del('/imposters/' + port);
                }).then(function (response) {
                    // replay the imposter body without change, and with the proxy shut down
                    return api.post('/imposters', response.body);
                }).then(function (response) {
                    assert.strictEqual(201, response.statusCode, JSON.stringify(response.body));

                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual('PROXIED', response.body);
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should set predicates automatically when using proxyAll', function () {
                var proxyPort = port + 1,
                    proxyStubs = [
                        {
                            predicates: { path: { is: '/first' } },
                            responses: [{ is: { body: 'first' }}]
                        },
                        {
                            predicates: { path: { is: '/second' } },
                            responses: [{ is: { body: 'second' }}]
                        }
                    ],
                    proxyRequest = { protocol: 'http', port: proxyPort, stubs: proxyStubs, name: this.name + ' PROXY' },
                    stub = { responses: [{ proxyAll: { to: 'http://localhost:' + proxyPort, remember: ['path'] } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name + ' MAIN' };

                return api.post('/imposters', proxyRequest).then(function () {
                    return api.post('/imposters', request);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return client.get('/first', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first');
                    return client.get('/second', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second');
                    return api.del('/imposters/' + proxyPort);
                }).then(function () {
                    return client.get('/first', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first');
                    return client.get('/second', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second');
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });
        });
    });
});
