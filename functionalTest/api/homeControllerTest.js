'use strict';

var assert = require('assert'),
    api = require('./api');

describe('GET /', function () {
    it('should return correct hypermedia', function (done) {
        api.get('/').then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            var impostersUrl = response.getLinkFor('imposters');
            return api.get(impostersUrl);
        }).done(function (response) {
            assert.strictEqual(response.statusCode, 200);
            done();
        }, function (error) {
            done(error);
        });
    });
});
