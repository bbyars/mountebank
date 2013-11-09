'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    mockery = require('mockery'),
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse');

describe('ImpostersController', function () {
    var response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', function () {
            var controller = Controller.create([], {});

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: []});
        });

        it('should send hypermedia for all imposters', function () {
            var firstImposter = { hypermedia: mock().returns("firstHypermedia") },
                secondImposter = { hypermedia: mock().returns("secondHypermedia") },
                controller = Controller.create([], { 1: firstImposter, 2: secondImposter });

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: ["firstHypermedia", "secondHypermedia"]});
        });
    });

    describe('#post', function () {
        var request, Imposter, imposter, ports;

        beforeEach(function () {
            request = { body: {} };
            imposter = {
                url: mock().returns("imposter-url"),
                hypermedia: mock().returns("hypermedia")
            };
            Imposter = {
                create: mock().returns({
                    then: function (fn) { fn(imposter); }
                })
            };
            ports = {
                isValidPortNumber: mock().returns(true),
                isPortInUse: mock().returns({
                    then: function (fn) { fn(false); }
                })
            };

            mockery.enable({
                useCleanCache: true,
                warnOnReplace: false,
                warnOnUnregistered: false
            });
            mockery.registerMock('../models/imposter', Imposter);
            mockery.registerMock('../util/ports', ports);
            mockery.registerMock('q', require('../fakes/fakeQ'));
            Controller = require('../../src/controllers/impostersController');
        });

        afterEach(function () {
            mockery.disable();
        });

        it('should return a 201 with the Location header set', function () {
            var controller = Controller.create([{ name: 'http' }], {});
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert(response.headers.Location, 'http://localhost/servers/3535');
            assert.strictEqual(response.statusCode, 201);
        });

        it('should return imposter hypermedia', function () {
            var controller = Controller.create([{ name: 'http' }], {});
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.body, "hypermedia");
        });

        it('should add new imposter to list of all imposters', function () {
            var imposters = {},
                controller = Controller.create([{ name: 'http' }], imposters);
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.deepEqual(imposters, { 3535: imposter });
        });

        it('should return a 400 for a missing port', function () {
            var controller = Controller.create([{ name: 'http' }], {});
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

        it('should return a 400 for an invalid port', function () {
            var controller = Controller.create([{ name: 'http' }], {});
            request.body = { protocol: 'http', port: 'invalid' };
            ports.isValidPortNumber = mock().returns(false);

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: "bad data",
                    message: "invalid value for 'port'"
                }]
            });
        });

        it('should return a 400 when the port is in use', function () {
            var controller = Controller.create([{ name: 'http' }], {});
            request.body = { protocol: 'http', port: 'invalid' };
            ports.isPortInUse = mock().returns({
                then: function (fn) { fn(true); }
            });

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: "port conflict",
                    message: "port already in use"
                }]
            });
        });

        it('should not check port availability if missing port', function () {
            var controller = Controller.create([{ name: 'http' }], {});
            request.body = { protocol: 'http' };

            controller.post(request, response);

            assert(!ports.isPortInUse.wasCalled());
        });

        it('should return a 400 for a missing protocol', function () {
            var controller = Controller.create([{ name: 'http' }], {});
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
            var protocols = [],
                controller = Controller.create(protocols, {});
            request.body = { port: 3535, protocol: 'unsupported' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'unsupported protocol');
        });

        it('should aggregate multiple errors', function () {
            var controller = Controller.create([], {});

            controller.post(request, response);

            assert.strictEqual(response.body.errors.length, 2, response.body.errors);
        });
    });
});
