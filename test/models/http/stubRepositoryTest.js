'use strict';

var assert = require('assert'),
    StubRepository = require('../../../src/models/http/stubRepository'),
    mock = require('../../mock').mock,
    Q = require('q');

describe('stubRepository', function () {
    var stubs, proxy;

    beforeEach(function () {
        proxy = {};
        stubs = StubRepository.create(proxy, true);
    });

    describe('#addStub and #resolve', function () {
        it('should return default response if no match', function (done) {
            var request = { path: '/test', headers: {}, body: '' };

            stubs.resolve(request).done(function (response) {
                assert.deepEqual(response, {
                    statusCode: 200,
                    headers: { connection: 'close' },
                    body: ''
                });
                done();
            });
        });

        it('should return stub if no predicate', function (done) {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { statusCode: 400 }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.statusCode, 400);
                done();
            });
        });

        it('should return match on path', function (done) {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                predicates: { path: { is: '/test' }},
                responses: [{ is: { statusCode: 400, headers: { 'X-Test': 'Test' }, body: 'Test successful' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.deepEqual(response, {
                    statusCode: 400,
                    headers: { connection: 'close', 'X-Test': 'Test' },
                    body: 'Test successful'
                });
                done();
            });
        });

        it('should merge default values with stub response', function (done) {
            var request = { path: '/test', headers: {}, body: '' };
            stubs.addStub({
                responses: [{ is: { body: 'Test successful' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.deepEqual(response, {
                    statusCode: 200,
                    headers: { connection: 'close' },
                    body: 'Test successful'
                });
                done();
            });
        });

        it('should return stubs in order, looping around', function (done) {
            var request = { path: '/test', headers: {}, body: '' },
                bodies = [];
            stubs.addStub({
                responses: [{ is: { body: 'First' }}, { is: { body: 'Second' }}]
            });

            stubs.resolve(request).then(function (response) {
                bodies.push(response.body);
                return stubs.resolve(request);
            }).then(function (response) {
                bodies.push(response.body);
                return stubs.resolve(request);
            }).done(function (response) {
                bodies.push(response.body);

                assert.deepEqual(bodies, ['First', 'Second', 'First']);
                done();
            });
        });

        it('should not return stub if does not match predicate method', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { path: { is: '/test' }, method: { is: 'POST' }},
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, '');
                done();
            });
        });

        it('should return default stub if header predicates fails', function (done) {
            var request = { path: '/test', headers: { first: 'value' }, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { exists: { first: true, second: true } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, '');
                done();
            });
        });

        it('should return stub if header predicate passes', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { headers: { exists: { first: false, second: false } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, 'Matched');
                done();
            });
        });

        it('should return default stub if not predicates fails', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'GET' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, '');
                done();
            });
        });

        it('should return stub if not predicate passes', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: { method: { not: { is: 'POST' } }},
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, 'Matched');
                done();
            });
        });

        it('should not be able to change state through inject', function (done) {
            var predicate = "function (request) { request.path = 'CHANGED'; return true; }",
                request = { path: '/test', headers: {}, body: '', method: 'GET' };
            stubs.addStub({
                predicates: {
                    request: { inject: predicate },
                    path: { is: '/test' } // this will fail if predicate executes on same request instance
                },
                responses: [{ is: { body: 'Matched' }}]
            });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, 'Matched');
                done();
            });
        });

        it('should return proxied result for proxy stub', function (done) {
            proxy.to = mock().returns(Q('PROXY'));
            var request = { path: '/test', headers: { key: 'value' }, body: 'BODY', method: 'GET' };
            stubs.addStub({ responses: [{ proxy: 'PROXIED URL' }] });

            stubs.resolve(request).done(function (response) {
                assert.ok(proxy.to.wasCalledWith('PROXIED URL', request));
                assert.strictEqual(response, 'PROXY');
                done();
            });
        });

        it('should only call proxy first time for proxyOnce stub', function (done) {
            proxy.to = mock().returns(Q({ body: 'PROXIED' }));
            var request = { path: '/test', headers: { key: 'value' }, body: 'BODY', method: 'GET' };
            stubs.addStub({ responses: [{ proxyOnce: 'PROXIED URL' }] });

            stubs.resolve(request).then(function (response) {
                assert.ok(proxy.to.wasCalledWith('PROXIED URL', request));
                assert.strictEqual(response.body, 'PROXIED');

                proxy.to = mock().returns(Q('PROXY'));
                return stubs.resolve(request);
            }).done(function (response) {
                assert.ok(!proxy.to.wasCalled());
                assert.strictEqual(response.body, 'PROXIED');
                done();
            });
        });

        it('should allow injected response', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' },
                fn = "function (request) { return { body: request.method + ' INJECTED' }; }";
            stubs.addStub({ responses: [{ inject: fn }] });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.body, 'GET INJECTED');
                done();
            });
        });

        it('should merge injected response with default values', function (done) {
            var request = { path: '/test', headers: {}, body: '', method: 'GET' },
                fn = "function (request) { return { body: 'INJECTED' }; }";
            stubs.addStub({ responses: [{ inject: fn }] });

            stubs.resolve(request).done(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.headers.connection, 'close');
                done();
            });
        });

        it('should record matches', function (done) {
            var matchingRequest = { path: '/test', headers: {}, body: '' },
                mismatchingRequest = { path: '/', headers: {}, body: '' },
                stub = {
                    predicates: { path: { is: '/test' }},
                    responses: [{ is: { body: 'MATCHED' } }]
                };
            stubs.addStub(stub);

            stubs.resolve(matchingRequest).then(function () {
                return stubs.resolve(mismatchingRequest);
            }).done(function () {
                assert.strictEqual(stub.matches.length, 1);
                assert.deepEqual(stub.matches[0].request, matchingRequest);
                done();
            });
        });
    });
});
