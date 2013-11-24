'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/imposterController'),
    FakeResponse = require('../fakes/fakeResponse');

describe('ImposterController', function () {
    var response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should return hypermedia for imposter at given id', function () {
            var imposters = {
                    1: { hypermedia: mock().returns("firstHypermedia") },
                    2: { hypermedia: mock().returns("secondHypermedia") }
                },
                controller = Controller.create(imposters);

            controller.get({ params: { id: 2 }}, response);

            assert.strictEqual(response.body, "secondHypermedia");
        });
    });

    describe('#del', function () {
        it('should stop the imposter', function () {
            var imposter = { stop: mock() },
                controller = Controller.create({ 1: imposter });

            controller.del({ params: { id: 1 }}, response);

            assert(imposter.stop.wasCalled());
        });

        it('should remove the imposter from the list', function () {
            var imposters = { 1: { stop: mock() }},
                controller = Controller.create(imposters);

            controller.del({ params: { id: 1 }}, response);

            assert.deepEqual(imposters, {});
        });

        it('should send request even if no imposter exists', function () {
            var imposters = {},
                controller = Controller.create(imposters);
            response.send = mock();

            controller.del({ params: { id: 1 }}, response);

            assert.ok(response.send.wasCalled());
        });
    });

    describe('#getRequests', function () {
        it('should return imposter requests', function () {
            var imposter = {
                    requests: [1, 2, 3]
                },
                controller = Controller.create({ 1: imposter });

            controller.getRequests({ params: { id: 1 }}, response);

            assert.deepEqual(response.body, { requests: [1, 2, 3] });
        });
    });

    describe('#addStub', function () {
        it('should add stub to imposter for valid requests', function () {
            var imposter = {
                    isValidStubRequest: mock().returns(true),
                    addStub: mock()
                },
                controller = Controller.create({ 1: imposter }),
                request = {
                    params: { id: 1 },
                    body: 'TEST BODY'
                };

            controller.addStub(request, response);

            assert.ok(imposter.isValidStubRequest.wasCalledWith('TEST BODY'));
            assert.ok(imposter.addStub.wasCalledWith('TEST BODY'));
            assert.strictEqual(response.statusCode, 200);
        });

        it('should return 400 with imposter errors for invalid requests', function () {
            var imposter = {
                    isValidStubRequest: mock().returns(false),
                    stubRequestErrorsFor: mock().returns('ERRORS')
                },
                controller = Controller.create({ 1: imposter }),
                request = { params: { id: 1 }};

            controller.addStub(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, { errors: 'ERRORS' });
        });
    });
});
