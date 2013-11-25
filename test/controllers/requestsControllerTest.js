'use strict';

var assert = require('assert'),
    Controller = require('../../src/controllers/requestsController'),
    FakeResponse = require('../fakes/fakeResponse');

describe('RequestsController', function () {
    var response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should return imposter requests', function () {
            var imposter = {
                    requests: [1, 2, 3]
                },
                controller = Controller.create({ 1: imposter });

            controller.get({ params: { id: 1 }}, response);

            assert.deepEqual(response.body, { requests: [1, 2, 3] });
        });
    });
});
