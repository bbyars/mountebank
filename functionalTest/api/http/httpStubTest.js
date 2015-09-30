'use strict';

var assert = require('assert'),
    api = require('../api'),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    compatibility = require('../../compatibility'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    helpers = require('../../../src/util/helpers');

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters with stubs', function () {
            promiseIt('should return stubbed response', function () {
                var stub = {
                        responses: [{
                            is: {
                                statusCode: 400,
                                headers: { 'X-Test': 'test header' },
                                body: 'test body',
                                query: {
                                    key: true
                                }
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);

                    return client.get('/test?key=true', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body, 'test body');
                    assert.strictEqual(response.headers['x-test'], 'test header');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should allow a sequence of stubs as a circular buffer', function () {
                var stub = { responses: [{ is: { statusCode: 400 }}, { is: { statusCode: 405 } }] },
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
                    return api.del('/imposters');
                });
            });

            promiseIt('should only return stubbed response if matches complex predicate', function () {
                var spec = {
                        path: '/test?key=value&next=true',
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
                        predicates: [
                            { equals: { path: '/test', method: 'POST' } },
                            { equals: { query: { key: 'value' } } },
                            { exists: { headers: { 'X-One': true } } },
                            { exists: { headers: { 'X-Two': true } } },
                            { equals: { headers: { 'X-Two': 'Test' } } },
                            { exists: { headers: { 'X-Three': false } } },
                            { not: { exists: { headers: { 'X-Four': true } } } },
                            { startsWith: { body: 'T' } },
                            { contains: { body: 'ES' } },
                            { endsWith: { body: 'T' } },
                            { matches: { body: '^TEST$' } },
                            { equals: { body: 'TEST' } },
                            { exists: { body: true } }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    var options = helpers.merge(spec, { path: '/', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong path');

                    var options = helpers.merge(spec, { path: '/test?key=different', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong query');

                    var options = helpers.merge(spec, { method: 'PUT', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong method');

                    var options = helpers.merge(spec, { body: 'TEST' });
                    delete options.headers['X-One'];
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; missing header');

                    var options = helpers.merge(spec, { headers: { 'X-Two': 'Testing', body: 'TEST' }});
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for header');

                    return client.responseFor(helpers.merge(spec, { body: 'TESTing' }));
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for body');

                    return client.responseFor(helpers.merge(spec, { body: 'TEST' }));
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, 'should have matched');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should correctly handle deepEquals object predicates', function () {
                var stubWithEmptyObjectPredicate = {
                        responses: [{ is: { body: 'first stub'} }],
                        predicates: [{ deepEquals: { query: {} } }]
                    },
                    stubWithPredicateKeywordInObject = {
                        responses: [{ is: { body: 'second stub'} }],
                        predicates: [{ deepEquals: { query: { equals: 1 } } }]
                    },
                    stubWithTwoKeywordsInObject = {
                        responses: [{ is: { body: 'third stub'} }],
                        predicates: [{ deepEquals: { query: { equals: 'true', contains: false } } }]
                    },
                    stubs = [stubWithEmptyObjectPredicate, stubWithPredicateKeywordInObject, stubWithTwoKeywordsInObject],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first stub');
                    return client.get('/?equals=something', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '');
                    return client.get('/?equals=1', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second stub');
                    return client.get('/?contains=false&equals=true', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'third stub');
                    return client.get('/?contains=false&equals=true&matches=yes', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should add latency when using behaviors.wait', function () {
                var stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: 1000 }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name },
                    timer;

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    timer = new Date();
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'stub');
                    var time = new Date() - timer;

                    // Occasionally there's some small inaccuracies
                    assert.ok(time >= 990, 'actual time: ' + time);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support post-processing when using behaviors.decorate', function () {
                var decorator = function (request, response) {
                        response.body = response.body.replace('${YEAR}', new Date().getFullYear());
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the year is ${YEAR}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'the year is ' + new Date().getFullYear());
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support using request parameters during decorating', function () {
                var decorator = function (request, response) {
                        response.body = response.body.replace('${PATH}', request.path);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the path is ${PATH}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'the path is /test');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support decorate functions that return a value by making that value the response', function () {
                var decorator = function (request, response) {
                        var clonedResponse = JSON.parse(JSON.stringify(response));
                        clonedResponse.body = 'This is a clone';
                        return clonedResponse;
                    },
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'This is a clone');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should return an error if the decorate JavaScript is not well formed', function () {
                var decorator = "response.body = 'This should not work';",
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, JSON.stringify(response.body, null, 2));
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support sending binary response', function () {
                var buffer = new Buffer([0, 1, 2, 3]),
                    stub = { responses: [{ is: { body: buffer.toString('base64'), _mode: 'binary' } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({ method: 'GET', port: port, path: '/', mode: 'binary' });
                }).then(function (response) {
                    assert.deepEqual(compatibility.bufferJSON(response.body), [0, 1, 2, 3]);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });
        });
    });
});
