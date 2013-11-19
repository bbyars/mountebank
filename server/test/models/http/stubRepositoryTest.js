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
            var request =  {
                path: '/test',
                responses: []
            };

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
                    headers: [ { exists: 'HEADER' } ]
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
                message: "invalid predicate 'path'"
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
                predicates: { path: { is: '/test' }},
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
                predicates: { path: { is: '/test' }},
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

        it('is should be case-insensitive', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { path: { is: '/TEST' }, method: { is: 'get' }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, 'Matched');
        });

        it('should not return stub if does not match predicate body', function () {
            var request = { path: '/test', headers: {}, body: 'TEST', method: 'POST' };
            stubs.addStub({
                predicates: { path: { is: '/test' }, body: { is: 'TESTING' }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, '');
        });

        it('should return stub if it matches predicate body', function () {
            var request = { path: '/test', headers: {}, body: 'TEST', method: 'POST' };
            stubs.addStub({
                predicates: { path: { is: '/test' }, body: { is: 'TEST' }},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, 'Matched');
        });

        it('should not return stub if does not match predicate header', function () {
            var request = { path: '/test', headers: {}, body: 'TEST', method: 'POST' };
            stubs.addStub({
                predicates: { headers: { is: { key: 'value' }}},
                responses: [{ is: { body: 'Matched' }}]
            });

            var response = stubs.resolve(request);

            assert.strictEqual(response.body, '');
        });
    });
});
