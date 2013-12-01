'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/imposterController'),
    FakeResponse = require('../fakes/fakeResponse');

describe('ImposterController', function () {

    describe('#get', function () {
        it('should return JSON for imposter at given id', function () {
            var response = FakeResponse.create(),
                imposters = {
                    1: { toJSON: mock().returns('firstJSON') },
                    2: { toJSON: mock().returns('secondJSON') }
                },
                controller = Controller.create(imposters);

            controller.get({ params: { id: 2 }}, response);

            assert.strictEqual(response.body, 'secondJSON');
        });
    });

    describe('#del', function () {
        it('should stop the imposter', function () {
            var response = FakeResponse.create(),
                imposter = { stop: mock() },
                controller = Controller.create({ 1: imposter });

            controller.del({ params: { id: 1 }}, response);

            assert(imposter.stop.wasCalled());
        });

        it('should remove the imposter from the list', function () {
            var response = FakeResponse.create(),
                imposters = { 1: { stop: mock() }},
                controller = Controller.create(imposters);

            controller.del({ params: { id: 1 }}, response);

            assert.deepEqual(imposters, {});
        });

        it('should send request even if no imposter exists', function () {
            var response = FakeResponse.create(),
                imposters = {},
                controller = Controller.create(imposters);
            response.send = mock();

            controller.del({ params: { id: 1 }}, response);

            assert.ok(response.send.wasCalled());
        });
    });
});
