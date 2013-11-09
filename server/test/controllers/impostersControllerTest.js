'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    mockery = require('mockery'),
    Controller = require('../../src/controllers/impostersController');

describe('ImpostersController', function () {
    var response;

    beforeEach(function () {
        response = {
            headers: {},
            send: function (body) { this.body = body; },
            setHeader: function (key, value) { this.headers[key] = value; },
            absoluteUrl: function (endpoint) { return 'http://localhost' + endpoint; }
        };
    });

    describe('#get', function () {
        it('should send an empty array if no servers', function () {
            var controller = Controller.create({}, []);

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: []});
        });

        it('should send hypermedia for all servers', function () {
            var firstServer = { hypermedia: function () { return "firstHypermedia"; } },
                secondServer = { hypermedia: function () { return "secondHypermedia"; } },
                controller = Controller.create({}, [firstServer, secondServer]);

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: ["firstHypermedia", "secondHypermedia"]});
        });
    });

    describe('#post', function () {
        var request, Imposter, imposter;

        beforeEach(function () {
            request = { body: {} };
            imposter = {
                hypermedia: mock().returns("hypermedia")
            };
            Imposter = {
                create: mock().returns({
                    then: function (fn) { fn(imposter); }
                })
            };

            mockery.enable({
                useCleanCache: true,
                warnOnReplace: false,
                warnOnUnregistered: false
            });
            mockery.registerMock('../models/imposter', Imposter);
            Controller = require('../../src/controllers/impostersController');
        });

        afterEach(function () {
            mockery.disable();
        });

        it('should return a 201 with the Location header set', function () {
            var controller = Controller.create({ http: {} }, []);
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert(response.headers.Location, 'http://localhost/servers/3535');
            assert.strictEqual(response.statusCode, 201);
        });

        it('should return imposter hypermedia', function () {
            var controller = Controller.create({ http : {} }, []);
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.strictEqual(response.body, "hypermedia");
        });

        it('should add new imposter to list of all imposters', function () {
            var imposters = [],
                controller = Controller.create({ http: {} }, imposters);
            request.body = { port: 3535, protocol: 'http' };

            controller.post(request, response);

            assert.deepEqual(imposters, [imposter]);
        });

        it('should return a 400 for a missing port', function () {
            var controller = Controller.create({ http: {} }, []);
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

        it('should return a 400 for a missing protocol', function () {
            var controller = Controller.create({ http: {} }, []);
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
            var protocols = {},
                controller = Controller.create(protocols, []);
            request.body = { port: 3535, protocol: 'unsupported' };

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'unsupported protocol');
        });
    });
});
