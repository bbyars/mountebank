'use strict';

const Controller = require('../../src/controllers/homeController'),
    assert = require('assert'),
    FakeResponse = require('../fakes/fakeResponse');

describe('homeController', () => {
    describe('#get', () => {
        it('should return base hypermedia', () => {
            const response = FakeResponse.create(),
                controller = Controller.create([]);

            controller.get({}, response);

            assert.deepEqual(response.body, {
                _links: {
                    imposters: { href: '/imposters' },
                    config: { href: '/config' },
                    logs: { href: '/logs' }
                }
            });
        });
    });
});
