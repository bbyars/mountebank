'use strict';

var assert = require('assert'),
    promiseIt = require('../testHelpers').promiseIt,
    api = require('../api/api'),
    httpClient = require('../api/http/baseHttpClient').create('http');

describe('the feed', function () {
    promiseIt('should default to page 1 with 10 entries', function () {

        return httpClient.get('/feed', api.port).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.headers['content-type'], 'application/atom+xml; charset=utf-8');
        });
    });
});
