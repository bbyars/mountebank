'use strict';

var assert = require('assert'),
    StubRepository = require('../../../src/models/http/stubRepository'),
    mock = require('../../mock').mock,
    Q = require('q'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('stubRepository', function () {
    var stubs, proxy;

    beforeEach(function () {
        proxy = {};
        stubs = StubRepository.create(proxy, true);
    });

    describe('#addStub and #resolve', function () {
        promiseIt('should return default response if no match', function () {
            var request = { path: '/test', headers: {}, body: '' };

            return stubs.resolve(request).then(function (response) {
                assert.deepEqual(response, {
                    statusCode: 200,
                    headers: { connection: 'close' },
                    body: ''
                });
            });
        });

        promiseIt('should return stub if no predicate', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { statusCode: 400 }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
            });
        });

        promiseIt('should return match on path', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                predicates: { path: { is: '/test' }},
                responses: [{ is: { statusCode: 400, headers: { 'X-Test': 'Test' }, body: 'Test successful' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.deepEqual(response, {
                    statusCode: 400,
                    headers: { connection: 'close', 'X-Test': 'Test' },
                    body: 'Test successful'
                });
            });
        });

        promiseIt('should merge default values with stub response', function () {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { body: 'Test successful' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.deepEqual(response, {
                    statusCode: 200,
                    headers: { connection: 'close' },
                    body: 'Test successful'
                });
            });
        });

        promiseIt('should return stubs in order, looping around', function () {
            var request = { path: '/test', headers: {}, body: '' },
                bodies = [];
            stubs.addStub({
                responses: [{ is: { body: 'First' }}, { is: { body: 'Second' }}]
            });

            return stubs.resolve(request).then(function (response) {
                bodies.push(response.body);
                return stubs.resolve(request);
            }).then(function (response) {
                bodies.push(response.body);
                return stubs.resolve(request);
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

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, '');
            });
        });

        promiseIt('should return default stub if header predicates fails', function () {
            var request = { path: '/test', headers: { first: 'value' }, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { exists: { first: true, second: true } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, '');
            });
        });

        promiseIt('should return stub if header predicate passes', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { first: { exists: false }, second: { exists: false } } },
                responses: [{ is: { body: 'Matched' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, 'Matched');
            });
        });

        promiseIt('should return default stub if not predicates fails', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'GET' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, '');
            });
        });

        promiseIt('should return stub if not predicate passes', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'POST' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, 'Matched');
            });
        });

        promiseIt('should not be able to change state through inject', function () {
            var predicate = "function (request) { request.path = 'CHANGED'; return true; }",
                request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: {
                    request: { inject: predicate },
                    path: { is: '/test' } // this will fail if predicate executes on same request instance
                },
                responses: [{ is: { body: 'Matched' }}]
            });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, 'Matched');
            });
        });

        promiseIt('should return proxied result for proxy stub', function () {
            proxy.to = mock().returns(Q('PROXY'));
            var request = { path: '/test', headers: { key: 'value' }, body: 'BODY', method: 'GET' };
            stubs.addStub({ responses: [{ proxy: 'PROXIED URL' }] });

            return stubs.resolve(request).then(function (response) {
                assert.ok(proxy.to.wasCalledWith('PROXIED URL', request));
                assert.strictEqual(response, 'PROXY');
            });
        });

        promiseIt('should only call proxy first time for proxyOnce stub', function () {
            proxy.to = mock().returns(Q({ body: 'PROXIED' }));
            var request = { path: '/test', headers: { key: 'value' }, body: 'BODY', method: 'GET' };
            stubs.addStub({ responses: [{ proxyOnce: 'PROXIED URL' }] });

            return stubs.resolve(request).then(function (response) {
                assert.ok(proxy.to.wasCalledWith('PROXIED URL', request));
                assert.strictEqual(response.body, 'PROXIED');

                proxy.to = mock().returns(Q('PROXY'));
                return stubs.resolve(request);
            }).then(function (response) {
                assert.ok(!proxy.to.wasCalled());
                assert.strictEqual(response.body, 'PROXIED');
            });
        });

        promiseIt('should allow injected response', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' },
                fn = "function (request) { return { body: request.method + ' INJECTED' }; }";
            stubs.addStub({ responses: [{ inject: fn }] });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.body, 'GET INJECTED');
            });
        });

        promiseIt('should merge injected response with default values', function () {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' },
                fn = "function (request) { return { body: 'INJECTED' }; }";
            stubs.addStub({ responses: [{ inject: fn }] });

            return stubs.resolve(request).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');
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

            return stubs.resolve(matchingRequest).then(function () {
                return stubs.resolve(mismatchingRequest);
            }).then(function () {
                assert.strictEqual(stub.matches.length, 1);
                assert.deepEqual(stub.matches[0].request, matchingRequest);
            });
        });
    });
});
