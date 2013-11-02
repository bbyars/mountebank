'use strict';

var controller = require('../../src/controllers/homeController'),
    assert = require('assert');

describe('homeController', function () {
    describe('#get', function () {
        it('should return base hypermedia', function () {
            var responseBody = '',
                response = {
                    absoluteUrl: function (endpoint) {
                        return 'http://localhost' + endpoint;
                    },
                    send: function (body) {
                        responseBody = body;
                    }
                };

            controller.get({}, response);

            assert.deepEqual(responseBody, {
                links: [{
                    href: 'http://localhost/servers',
                    rel: 'servers'
                }]
            });
        });
    });
});
