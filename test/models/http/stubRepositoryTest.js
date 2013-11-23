'use strict';

var assert = require('assert'),
    StubRepository = require('../../../src/models/http/stubRepository');

describe('stubRepository', function () {
    var stubs;

    beforeEach(function () {
        stubs = StubRepository.create();
    });

    describe('#isValidStubRequest and #stubRequestErrorsFor', function () {
        it('should return true for valid request', function () {
            var request =  {
                    responses: [{
                        is: {
                            statusCode: 400,
                            headers: { 'X-Test': 'test header' },
                            body: 'test body'
                        }
                    }]
                };

            assert.ok(stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), []);
        });

        it('should have at least one response', function () {
            var request =  { responses: [] };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "'responses' must be a non-empty array"
            }]);
        });

        it('should return true for a valid predicate', function () {
            var request = {
                responses: [{}],
                predicates: {
                    path: { is: '/test' },
                    method: { is: 'GET' },
                    body: { is: 'BODY' },
                    headers: { exists: { 'TEST': true } }
                }
            };

            assert.ok(stubs.isValidStubRequest(request));
        });

        it('should have a valid predicate for path', function () {
            var request = {
                responses: [{}],
                predicates: {
                    path: '/test'
                }
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "invalid predicate for 'path'"
            }]);
        });

        it('should detect invalid predicate', function () {
            var request = {
                responses: [{}],
                predicates: {
                    path: { invalidPredicate: '/test' }
                }
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "no predicate 'invalidPredicate'"
            }]);
        });

        it('should detect invalid predicate mixed with valid predicates', function () {
            var request = {
                responses: [{}],
                predicates: {
                    path: { is: '/test' },
                    body: { invalidPredicate: 'value' }
                }
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "no predicate 'invalidPredicate'"
            }]);
        });

        it('should detect malformed predicate', function () {
            var request = {
                responses: [{}],
                predicates: {
                    headers: [ { exists: 'Test' }]
                }
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "malformed predicate"
            }]);
        });

        it('should accept well formed inject', function () {
            var request = {
                predicates: { request: { inject: "function () { return true; }" } },
                responses: [{ is: { body: 'Matched' }}]
            };

            assert.ok(stubs.isValidStubRequest(request));
        });

        it('should reject inject with no wrapper function', function () {
            var request = {
                predicates: { request: { inject: "return true;" } },
                responses: [{ is: { body: 'Matched' }}]
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'bad data',
                message: "malformed predicate"
            }]);
        });
    });

    describe('#addStub and #resolve', function () {
        it('should return default response if no match', function () {
            var request = { path: '/test', headers: {}, body: '' };

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 200,
                headers: { connection: 'close' },
                body: ''
            });
        });

        it('should return stub if no predicate', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { statusCode: 400 }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.statusCode, 400);
        });

        it('should return match on path', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                predicates: { path: { is: '/test' }},
                responses: [{ is: { statusCode: 400, headers: { 'X-Test': 'Test' }, body: 'Test successful' }}]
            });

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 400,
                headers: { connection: 'close', 'X-Test': 'Test' },
                body: 'Test successful'
            });
        });

        it('should merge default values with stub response', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { body: 'Test successful' }}]
            });

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 200,
                headers: { connection: 'close' },
                body: 'Test successful'
            });
        });

        it('should return stubs in order, looping around', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { body: 'First' }}, { is: { body: 'Second' }}]
            });

            var bodies = [stubs.resolve(request), stubs.resolve(request), stubs.resolve(request)].map(function (value) {
                return value.body;
            });

            assert.deepEqual(bodies, ['First', 'Second', 'First']);
        });

        it('should not return stub if does not match predicate method', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { path: { is: '/test' }, method: { is: 'POST' }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, '');
        });

        it('should return default stub if header predicates fails', function () {
            var request = { path: '/test', headers: { first: 'value' }, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { exists: { first: true, second: true } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, '');
        });

        it('should return stub if header predicate passes', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { exists: { first: false, second: false } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, 'Matched');
        });

        it('should return default stub if not predicates fails', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'GET' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, '');
        });

        it('should return stub if not predicate passes', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'POST' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, 'Matched');
        });

        it('should not be able to change state through inject', function () {
            var predicate = "function (request) { request.path = 'CHANGED'; return true; }",
                request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: {
                    request: { inject: predicate },
                    path: { is: '/test' } // this will fail if predicate executes on same request instance
                },
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, 'Matched');
        });
    });
});
