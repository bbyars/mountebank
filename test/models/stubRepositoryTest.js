'use strict';

var assert = require('assert'),
    StubRepository = require('../../src/models/stubRepository'),
    mock = require('../mock').mock,
    promiseIt = require('../testHelpers').promiseIt,
    combinators = require('../../src/util/combinators'),
    StubResolver = require('../../src/models/stubResolver');

describe('stubRepository', function () {
    var stubs, proxy, logger, resolver;

    beforeEach(function () {
        proxy = {};
        logger = { debug: mock(), info: mock(), warn: mock(), error: mock() };
        resolver = StubResolver.create(proxy, combinators.identity);
        stubs = StubRepository.create(resolver);
    });

    promiseIt('should return default response if no match', function () {
        var request = { path: '/test', headers: {}, body: '' };

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, {});
        });
    });

    promiseIt('should return stub if no predicate', function () {
        var request = { path: '/test', headers: {}, body: '' };
        stubs.addStub({
            responses: [{ is: { statusCode: 400 }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.strictEqual(response.statusCode, 400);
        });
    });

    promiseIt('should return match on path', function () {
        var request = { path: '/test', headers: {}, body: '' };
        stubs.addStub({
            predicates: { path: { is: '/test' }},
            responses: [{ is: { statusCode: 400, headers: { 'X-Test': 'Test' }, body: 'Test successful' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, {
                statusCode: 400,
                headers: { 'X-Test': 'Test' },
                body: 'Test successful'
            });
        });
    });

    promiseIt('should merge default values with stub response', function () {
        var request = { path: '/test', headers: {}, body: '' };
        stubs.addStub({
            responses: [{ is: { body: 'Test successful' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, { body: 'Test successful' });
        });
    });

    promiseIt('should return stubs in order, looping around', function () {
        var request = { path: '/test', headers: {}, body: '' },
            bodies = [];
        stubs.addStub({
            responses: [{ is: { body: 'First' }}, { is: { body: 'Second' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            bodies.push(response.body);
            return stubs.resolve(request, logger);
        }).then(function (response) {
            bodies.push(response.body);
            return stubs.resolve(request, logger);
        }).then(function (response) {
            bodies.push(response.body);

            assert.deepEqual(bodies, ['First', 'Second', 'First']);
        });
    });

    promiseIt('should not return stub if does not match predicate method', function () {
        var request = { path: '/test', headers: {}, body: '', method: 'GET' };
        stubs.addStub({
            predicates: { path: { is: '/test' }, method: { is: 'POST' }},
            responses: [{ is: { body: 'Matched' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, {});
        });
    });

    promiseIt('should return default stub if header predicates fails', function () {
        var request = { path: '/test', headers: { first: 'value' }, body: '', method: 'GET' };
        stubs.addStub({
            predicates: { headers: { exists: { first: true, second: true } }},
            responses: [{ is: { body: 'Matched' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, {});
        });
    });

    promiseIt('should return stub if header predicate passes', function () {
        var request = { path: '/test', headers: {}, body: '', method: 'GET' };
        stubs.addStub({
            predicates: { headers: { first: { exists: false }, second: { exists: false } } },
            responses: [{ is: { body: 'Matched' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.strictEqual(response.body, 'Matched');
        });
    });

    promiseIt('should return default stub if not predicates fails', function () {
        var request = { path: '/test', headers: {}, body: '', method: 'GET' };
        stubs.addStub({
            predicates: { method: { not: { is: 'GET' } }},
            responses: [{ is: { body: 'Matched' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.deepEqual(response, {});
        });
    });

    promiseIt('should return stub if not predicate passes', function () {
        var request = { path: '/test', headers: {}, body: '', method: 'GET' };
        stubs.addStub({
            predicates: { method: { not: { is: 'POST' } }},
            responses: [{ is: { body: 'Matched' }}]
        });

        return stubs.resolve(request, logger).then(function (response) {
            assert.strictEqual(response.body, 'Matched');
        });
    });

    promiseIt('should record matches', function () {
        var matchingRequest = { path: '/test', headers: {}, body: '' },
            mismatchingRequest = { path: '/', headers: {}, body: '' },
            stub = {
                predicates: { path: { is: '/test' }},
                responses: [{ is: { body: 'MATCHED' } }]
            };
        stubs.addStub(stub);

        return stubs.resolve(matchingRequest, logger).then(function () {
            return stubs.resolve(mismatchingRequest, logger);
        }).then(function () {
            assert.strictEqual(stub.matches.length, 1);
            assert.deepEqual(stub.matches[0].request, matchingRequest);
        });
    });
});
