'use strict';

var assert = require('assert'),
    api = require('./api').create(),
    promiseIt = require('../testHelpers').promiseIt;

describe('GET /', function () {
    promiseIt('should return correct hypermedia', function () {
        var links;

        return api.get('/').then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            links = response.body._links;
            return api.get(links.imposters.href);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return api.get(links.config.href);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return api.get(links.logs.href);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        });
    });
});
