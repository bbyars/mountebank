'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse');

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
        var request, Imposter, imposter, imposters, controller;

        beforeEach(function () {
            request = { body: {} };
            imposter = {
                url: mock().returns("imposter-url"),
                hypermedia: mock().returns("hypermedia")
            };
            Imposter = {
                create: mock().returnsPromiseResolvingTo(imposter)
            };
            imposters = {};
            controller = Controller.create({
                protocols: [{ name: 'http' }],
                imposters: imposters,
                Imposter: Imposter
            });
        });

        it('should return a 201 with the Location header set', function () {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert(response.headers.Location, 'http://localhost/servers/3535');
            assert.strictEqual(response.statusCode, 201);
        });

        it('should return imposter hypermedia', function () {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.body, "hypermedia");
        });

        it('should add new imposter to list of all imposters', function () {
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.deepEqual(imposters, { 3535: imposter });
        });

        it('should return a 400 for a missing port', function () {
            request.body = { protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: "missing field",
                    message: "'port' is a required field"
                }]
            });
        });

        it('should return a 400 for a floating point port', function () {
            request.body = { protocol: 'http', port: '123.45' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: "bad data",
                    message: "invalid value for 'port'"
                }]
            });
        });

        it('should return a 400 for a missing protocol', function () {
            request.body = { port: 3535 };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: "missing field",
                    message: "'protocol' is a required field"
                }]
            });
        });

        it('should return a 400 for unsupported protocols', function () {
            request.body = { port: 3535, protocol: 'unsupported' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'unsupported protocol');
        });

        it('should aggregate multiple errors', function () {
            controller.post(request, response);

            assert.strictEqual(response.body.errors.length, 2, response.body.errors);
        });

        it('should return a 403 for insufficient access', function () {
            Imposter.create = mock().returnsPromiseRejection({
                code: 'insufficient access',
                key: 'value'
            });
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 403);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'insufficient access',
                    key: 'value'
                }]
            });
        });

        it('should return a 400 for other protocol creation errors', function () {
            Imposter.create = mock().returnsPromiseRejection({
                code: 'error',
                key: 'value'
            });
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'error',
                    key: 'value'
                }]
            });
        });
    });
});
