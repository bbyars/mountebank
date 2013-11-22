'use strict';

var controller = require('../../src/controllers/homeController'),
    assert = require('assert'),
    FakeResponse = require('../fakes/fakeResponse');

describe('homeController', function () {
    describe('#get', function () {
        it('should return base hypermedia', function () {
            var response = FakeResponse.create();

            controller.get({}, response);

            assert.deepEqual(response.body, {
                links: [{
                    href: 'http://localhost/imposters',
                    rel: 'imposters'
                }]
            });
        });
    });
});
