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
                    path: '/test',
                    responses: [{
                        statusCode: 400,
                        headers: { 'X-Test': 'test header' },
                        body: 'test body'
                    }]
                };

            assert.ok(stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), []);
        });

        it('should return false if missing path', function () {
            var request =  {
                responses: [{
                    statusCode: 400,
                    headers: { 'X-Test': 'test header' },
                    body: 'test body'
                }]
            };

            assert.ok(!stubs.isValidStubRequest(request));
            assert.deepEqual(stubs.stubRequestErrorsFor(request), [{
                code: 'missing field',
                message: "'path' is a required field"
            }]);
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
    });

    describe('#addStub and #resolve', function () {
        it('should return default response if no match', function () {
            var request = {
                    path: '/test',
                    headers: {},
                    body: ''
                };

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 200,
                headers: { connection: 'close' },
                body: ''
            });
        });

        it('should return match on path', function () {
            var request = {
                    path: '/test',
                    headers: {},
                    body: ''
                };
            stubs.addStub({
                path: '/test',
                responses: [{
                    statusCode: 400,
                    headers: { 'X-Test': 'Test' },
                    body: 'Test successful'
                }]
            });

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 400,
                headers: {
                    connection: 'close',
                    'X-Test': 'Test'
                },
                body: 'Test successful'
            });
        });

        it('should merge default values with stub response', function () {
            var request = {
                path: '/test',
                headers: {},
                body: ''
            };
            stubs.addStub({
                path: '/test',
                responses: [{
                    body: 'Test successful'
                }]
            });

            var response = stubs.resolve(request);

            assert.deepEqual(response, {
                statusCode: 200,
                headers: { connection: 'close' },
                body: 'Test successful'
            });
        });

        it('should return stubs in order, looping around', function () {
            var request = {
                path: '/test',
                headers: {},
                body: ''
            };
            stubs.addStub({
                path: '/test',
                responses: [{ body: 'First' }, { body: 'Second' }]
            });

            var first = stubs.resolve(request);
            var second = stubs.resolve(request);
            var third = stubs.resolve(request);
            var bodies = [first, second, third].map(function (value) {
                return value.body;
            });

            assert.deepEqual(bodies, ['First', 'Second', 'First']);
        });
    });
});
