'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/stubsController'),
    FakeResponse = require('../fakes/fakeResponse');

describe('ImposterController', function () {

    describe('#post', function () {
        it('should add stub to imposter for valid requests', function () {
            var response = FakeResponse.create(),
                imposter = {
                    addStub: mock(),
                    Validator: {
                        create: mock().returns({
                            isValid: mock().returns(true)
                        })
                    }
                },
                controller = Controller.create({ 1: imposter }),
                request = {
                    params: { id: 1 },
                    body: 'TEST BODY'
                };

            controller.post(request, response);

            assert.ok(imposter.addStub.wasCalledWith('TEST BODY'));
            assert.strictEqual(response.statusCode, 200);
        });

        it('should return 400 with imposter errors for invalid requests', function () {
            var response = FakeResponse.create(),
                imposter = {
                    Validator: {
                        create: mock().returns({
                            isValid: mock().returns(false),
                            errors: mock().returns('ERRORS')
                        })
                    }
                },
                controller = Controller.create({ 1: imposter }),
                request = { params: { id: 1 }};

            controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, { errors: 'ERRORS' });
        });
    });

    describe('#get', function () {
        it('should return 200 with imposters list', function () {
            var response = FakeResponse.create(),
                imposter = { stubsHypermedia: mock().returns('STUBS') },
                controller = Controller.create({ 1: imposter }),
                request = { params: { id: 1 }};

            controller.get(request, response);

            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.body, 'STUBS');
        });
    });
});
