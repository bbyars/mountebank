'use strict';

var assert = require('assert'),
    api = require('./api'),
    promiseIt = require('../testHelpers').promiseIt;

describe('GET /', function () {
    promiseIt('should return correct hypermedia', function () {
        return api.get('/').then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            return api.get(response.body._links.imposters.href);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        });
    });
});
