'use strict';

if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_RUN_WEB_TESTS === 'true') {
    var assert = require('assert'),
        api = require('../api/api'),
        crawler = require('./crawler'),
        promiseIt = require('../testHelpers').promiseIt,
        expectedContentType = function (contentType) {
            if (!contentType) {
                return true;
            }
            return ['text/html', 'application/atom+xml'].some(function (type) {
                return contentType.indexOf(type) >= 0;
            });
        },
        expectedStatusCode = function (statusCode) {
            return [200, 301, 302].indexOf(statusCode) >= 0;
        };

    describe('The mountebank website', function () {
        this.timeout(60000);

        promiseIt('should have no dead links and a valid sitemap', function () {
            var crawlResults;
            return crawler.create().crawl(api.url + '/', '').then(function (result) {
                // Validate no broken links
                var errors = { misses: {} };
                errors.errors = result.errors;
                Object.keys(result.hits).forEach(function (link) {
                    if (!expectedStatusCode(result.hits[link].statusCode) ||
                        !expectedContentType(result.hits[link].contentType)) {
                        errors.misses[link] = result.hits[link];
                    }
                });

                assert.deepEqual(errors, { errors: [], misses: {} }, JSON.stringify(errors, null, 4));

                crawlResults = result;
                return api.get('/sitemap');
            }).then(function (response) {
                var siteLinks = Object.keys(crawlResults.hits).filter(function (link) {
                        return link.indexOf(api.url) === 0 && link.indexOf('#') < 0 && link.indexOf('?') < 0;
                    }).map(function (link) {
                        return link.replace(api.url, 'http://www.mbtest.org');
                    }),
                    linksNotInSitemap = siteLinks.filter(function (link) {
                        return response.body.indexOf(link) < 0;
                    });

                assert.strictEqual(200, response.statusCode);
                assert.deepEqual(linksNotInSitemap, [], JSON.stringify(linksNotInSitemap));
            });
        });
    });
}
