'use strict';

var assert = require('assert'),
    api = require('../api/api'),
    crawler = require('./crawler'),
    promiseIt = require('../testHelpers').promiseIt;

function expectedContentType (contentType) {
    if (!contentType) {
        return true;
    }
    return ['text/html', 'application/atom+xml'].some(function (type) {
        return contentType.indexOf(type) >= 0;
    });
}

function expectedStatusCode (statusCode) {
    return [200, 301, 302].indexOf(statusCode) >= 0;
}

if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_SKIP_W3C_TESTS !== 'true') {
    describe('The mountebank website', function () {
        this.timeout(30000);

        promiseIt('should have no dead links', function () {
            return crawler.create().crawl(api.url + '/', '').then(function (result) {
                var errors = {misses: {}};
                errors.errors = result.errors;
                Object.keys(result.hits).forEach(function (link) {
                    if (!expectedStatusCode(result.hits[link].statusCode) || !expectedContentType(result.hits[link].contentType)) {
                        errors.misses[link] = result.hits[link];
                    }
                });

                assert.deepEqual(errors, {errors: [], misses: {}}, JSON.stringify(errors, null, 4));
            });
        });
    });
}
