'use strict';

var assert = require('assert'),
    api = require('./api'),
    promiseIt = require('../testHelpers').promiseIt;

describe('GET /', function () {
    promiseIt('should return correct hypermedia', function () {
        return api.get('/').then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            var impostersUrl = response.getLinkFor('imposters');
            return api.get(impostersUrl);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        });
    });
});
