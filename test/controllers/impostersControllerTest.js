'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

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

        it('should send JSON for all imposters', function () {
            var firstImposter = { toJSON: mock().returns('firstJSON') },
                secondImposter = { toJSON: mock().returns('secondJSON') },
                controller = Controller.create({ imposters: { 1: firstImposter, 2: secondImposter } });

            controller.get({}, response);

            assert.deepEqual(response.body, {imposters: ['firstJSON', 'secondJSON']});
        });
    });

    describe('#post', function () {
        var request, Imposter, imposter, imposters, Protocol, controller;

        beforeEach(function () {
            request = { body: {} };
            imposter = {
                url: mock().returns('imposter-url'),
                toJSON: mock().returns('JSON')
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

        promiseIt('should return a 201 with the Location header set', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert(response.headers.Location, 'http://localhost/servers/3535');
                assert.strictEqual(response.statusCode, 201);
            });
        });

        promiseIt('should return imposter JSON', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.body, 'JSON');
            });
        });

        promiseIt('should add new imposter to list of all imposters', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.deepEqual(imposters, { 3535: imposter });
            });
        });

        promiseIt('should return a 400 for a missing port', function () {
            request.body = { protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "missing field",
                        message: "'port' is a required field"
                    }]
                });
            });
        });

        promiseIt('should return a 400 for a floating point port', function () {
            request.body = { protocol: 'http', port: '123.45' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "bad data",
                        message: "invalid value for 'port'"
                    }]
                });
            });
        });

        promiseIt('should return a 400 for a missing protocol', function () {
            request.body = { port: 3535 };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: "missing field",
                        message: "'protocol' is a required field"
                    }]
                });
            });
        });

        promiseIt('should return a 400 for unsupported protocols', function () {
            request.body = { port: 3535, protocol: 'unsupported' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors.length, 1);
                assert.strictEqual(response.body.errors[0].code, 'unsupported protocol');
            });
        });

        promiseIt('should aggregate multiple errors', function () {
            return controller.post(request, response).then(function () {
                assert.strictEqual(response.body.errors.length, 2, response.body.errors);
            });
        });

        promiseIt('should return a 403 for insufficient access', function () {
            Imposter.create = mock().returns(Q.reject({
                code: 'insufficient access',
                key: 'value'
            }));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 403);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'insufficient access',
                        key: 'value'
                    }]
                });
            });
        });

        promiseIt('should return a 400 for other protocol creation errors', function () {
            Imposter.create = mock().returns(Q.reject('ERROR'));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: ['ERROR'] });
            });
        });

        promiseIt('should not call protocol validation if there are common validation failures', function () {
            Protocol.Validator = { create: mock() };
            request.body = { protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.ok(!Protocol.Validator.create.wasCalled());
            });
        });

        promiseIt('should validate with Protocol if there are no common validation failures', function () {
            Protocol.Validator = {
                create: mock().returns({
                    isValid: mock().returns(false),
                    errors: mock().returns('ERROR')
                })
            };
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: 'ERROR' });
            });
        });
    });
});
