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
        it('should return 404 for invalid id', function () {
            var controller = Controller.create({});

            controller.get({ params: { id: 1 }}, response);

            assert.strictEqual(response.statusCode, 404);
        });

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
        it('should return 404 for invalid id', function () {
            var controller = Controller.create({});

            controller.del({ params: { id: 1 }}, response);

            assert.strictEqual(response.statusCode, 404);
        });

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
    });
});
