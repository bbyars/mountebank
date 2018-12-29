'use strict';

const assert = require('assert'),
    api = require('./api').create(),
    promiseIt = require('../testHelpers').promiseIt;

describe('GET /', function () {
    promiseIt('should return correct hypermedia', function () {
        let links;

        return api.get('/').then(response => {
            assert.strictEqual(response.statusCode, 200);
            links = response.body._links;
            return api.get(links.imposters.href);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return api.get(links.config.href);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
            return api.get(links.logs.href);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        });
    });
});
