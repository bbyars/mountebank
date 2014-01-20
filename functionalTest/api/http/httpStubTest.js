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
                    return api.del('/imposters/' + port);
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

            promiseIt('should correctly handle deepEquals object predicates', function () {
                var stubWithEmptyObjectPredicate = {
                        responses: [{ is: { body: 'first stub'} }],
                        predicates: [{ deepEquals: { query: {} } }]
                    },
                    stubWithPredicateKeywordInObject = {
                        responses: [{ is: { body: 'second stub'} }],
                        predicates: [{ deepEquals: { query: { equals: 'value' } } }]
                    },
                    stubWithTwoKeywordsInObject = {
                        responses: [{ is: { body: 'third stub'} }],
                        predicates: [{ deepEquals: { query: { equals: 'true', contains: 'false' } } }]
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
                    return client.get('/?equals=value', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second stub');
                    return client.get('/?contains=false&equals=true', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'third stub');
                    return client.get('/?contains=false&equals=true&matches=yes', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '');
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });
        });
    });
});
