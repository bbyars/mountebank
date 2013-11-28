'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    Q = require('q');

describe('ImpostersController', function () {
    var response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', function () {
            var controller = Controller.create({ imposters: {} });

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: []});
        });

        it('should send hypermedia for all imposters', function () {
            var firstImposter = { hypermedia: mock().returns("firstHypermedia") },
                secondImposter = { hypermedia: mock().returns("secondHypermedia") },
                controller = Controller.create({ imposters: { 1: firstImposter, 2: secondImposter } });

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: ["firstHypermedia", "secondHypermedia"]});
        });
    });

    describe('#post', function () {
        var request, Imposter, imposter, imposters, Protocol, controller;

        beforeEach(function () {
            request = { body: {} };
            imposter = {
                url: mock().returns("imposter-url"),
                hypermedia: mock().returns("hypermedia")
            };
            Imposter = {
                create: mock().returns(Q(imposter))
            };
            imposters = {};
            Protocol = { name: 'http' };
            controller = Controller.create({
                protocols: [Protocol],
                imposters: imposters,
                Imposter: Imposter
            });
        });

        it('should return a 201 with the Location header set', function (done) {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert(response.headers.Location, 'http://localhost/servers/3535');
                assert.strictEqual(response.statusCode, 201);
                done();
            });
        });

        it('should return imposter hypermedia', function (done) {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.body, "hypermedia");
                done();
            });
        });

        it('should add new imposter to list of all imposters', function (done) {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.deepEqual(imposters, { 3535: imposter });
                done();
            });
        });

        it('should return a 400 for a missing port', function (done) {
            request.body = { protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "missing field",
                        message: "'port' is a required field"
                    }]
                });
                done();
            });
        });

        it('should return a 400 for a floating point port', function (done) {
            request.body = { protocol: 'http', port: '123.45' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "bad data",
                        message: "invalid value for 'port'"
                    }]
                });
                done();
            });
        });

        it('should return a 400 for a missing protocol', function (done) {
            request.body = { port: 3535 };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "missing field",
                        message: "'protocol' is a required field"
                    }]
                });
                done();
            });
        });

        it('should return a 400 for unsupported protocols', function (done) {
            request.body = { port: 3535, protocol: 'unsupported' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors.length, 1);
                assert.strictEqual(response.body.errors[0].code, 'unsupported protocol');
                done();
            });
        });

        it('should aggregate multiple errors', function (done) {
            controller.post(request, response).done(function () {
                assert.strictEqual(response.body.errors.length, 2, response.body.errors);
                done();
            });
        });

        it('should return a 403 for insufficient access', function (done) {
            Imposter.create = mock().returns(Q.reject({
                code: 'insufficient access',
                key: 'value'
            }));
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 403);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'insufficient access',
                        key: 'value'
                    }]
                });
                done();
            });
        });

        it('should return a 400 for other protocol creation errors', function (done) {
            Imposter.create = mock().returns(Q.reject('ERROR'));
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: ['ERROR'] });
                done();
            });
        });

        it('should not call protocol validation if there are common validation failures', function (done) {
            Protocol.Validator = { create: mock() };
            request.body = { protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.ok(!Protocol.Validator.create.wasCalled());
                done();
            });
        });

        it('should validate with Protocol if there are no common validation failures', function (done) {
            Protocol.Validator = {
                create: mock().returns({
                    isValid: mock().returns(false),
                    errors: mock().returns('ERROR')
                })
            };
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response).done(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: 'ERROR' });
                done();
            });
        });
    });
});
