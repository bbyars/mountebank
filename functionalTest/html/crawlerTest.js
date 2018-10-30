'use strict';

if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_RUN_WEB_TESTS === 'true') {
    const assert = require('assert'),
        api = require('../api/api').create(),
        crawler = require('./crawler'),
        promiseIt = require('../testHelpers').promiseIt,
        expectedContentType = contentType => {
            if (!contentType) {
                return true;
            }
            return ['text/html', 'application/atom+xml', 'text/plain', 'application/octet-stream'].some(type => contentType.indexOf(type) >= 0);
        },
        isLocalLink = link => link.indexOf(api.url) === 0,
        expectedStatusCode = (link, statusCode) =>
            // The 999 Request Denied code started coming from Slideshare
            // It works locally but fails on TravisCI. I tried spoofing with a chrome user agent,
            // but it still failed on Travis, so there's some clever spider detection they're doing.
            // Added 50x codes to make test less brittle - those have been ephemeral errors, as
            // long as they're not part of the mb site itself
            [200, 301, 302, 999].indexOf(statusCode) >= 0 ||
                ([500, 502, 503].indexOf(statusCode) >= 0 && isLocalLink(link));

    describe('The mountebank website', () => {
        promiseIt('should have no dead links and a valid sitemap', () => {
            let crawlResults;
            return crawler.create().crawl(`${api.url}/`, '').then(result => {
                // Validate no broken links
                const errors = { misses: {} };
                errors.errors = result.errors;
                Object.keys(result.hits).forEach(link => {
                    if (!expectedStatusCode(link, result.hits[link].statusCode) ||
                        !expectedContentType(result.hits[link].contentType)) {
                        errors.misses[link] = result.hits[link];
                    }
                });

                assert.deepEqual(errors, { errors: [], misses: {} }, JSON.stringify(errors, null, 4));

                crawlResults = result;
                return api.get('/sitemap');
            }).then(response => {
                const siteLinks = Object.keys(crawlResults.hits).filter(link => isLocalLink(link) && link.indexOf('#') < 0 && link.indexOf('?') < 0).map(link => link.replace(api.url, 'http://www.mbtest.org')),
                    linksNotInSitemap = siteLinks.filter(link => response.body.indexOf(link) < 0);

                assert.strictEqual(200, response.statusCode);
                assert.deepEqual(linksNotInSitemap, [], JSON.stringify(linksNotInSitemap));
            });
        }).timeout(180000);
    });
}
