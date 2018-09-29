'use strict';

const assert = require('assert'),
    w3cjs = require('w3cjs'),
    api = require('../api/api').create(),
    Q = require('q'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    currentVersion = require('../../package.json').version,
    promiseIt = require('../testHelpers').promiseIt,
    util = require('util');

function assertValid (path, html) {
    const deferred = Q.defer();

    w3cjs.validate({
        input: html,
        callback: function (error, response) {
            if (error) {
                console.log('w3cjs error on ' + path);
                assert.fail(error);
            }
            const errors = (response.messages || []).filter(function (message) {
                return message.type === 'error';
            }).map(function (message) {
                return {
                    line: message.lastLine,
                    message: message.message
                };
            });
            assert.strictEqual(0, errors.length,
                'Errors for ' + path + ': ' + JSON.stringify(errors, null, 2));
            console.log(path + ' is valid');
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function removeKnownErrorsFrom (html) {
    const docsTestFrameworkTags = ['testScenario', 'step', 'volatile', 'assertResponse', 'change'];
    let result = html;

    // ignore errors for webkit attributes on search box
    result = result.replace("results='5' autosave='mb' ", '');

    docsTestFrameworkTags.forEach(function (tagName) {
        const pattern = util.format('</?%s[^>]*>', tagName),
            regex = new RegExp(pattern, 'g');
        result = result.replace(regex, '');
    });

    return result;
}

function getHTML (path) {
    const spec = {
        port: api.port,
        method: 'GET',
        path: path,
        headers: { accept: 'text/html' }
    };

    return httpClient.responseFor(spec).then(response => {
        assert.strictEqual(response.statusCode, 200, 'Status code for ' + path + ': ' + response.statusCode);

        return Q(removeKnownErrorsFrom(response.body));
    });
}

// MB_AIRPLANE_MODE because these require network access
// MB_RUN_WEB_TESTS because these are slow, occasionally fragile, and there's
// no value running them with every node in the build matrix
if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_RUN_WEB_TESTS === 'true') {
    describe('all pages in the mountebank website', () => {
        this.timeout(60000);

        promiseIt('should be valid html', () => {
            // feed isn't html and is tested elsewhere; support has non-valid Google HTML embedded
            const blacklist = ['/feed', '/support', '/imposters', '/logs'];

            return api.get('/sitemap').then(response => {
                assert.strictEqual(response.statusCode, 200);

                const siteLinks = response.body.split('\n').map(link => link.replace('http://www.mbtest.org', '')).filter(path =>
                        // save time by only checking latest releases, others should be immutable
                        path !== '' &&
                               blacklist.indexOf(path) < 0 &&
                               (path.indexOf('/releases/') < 0 || path.indexOf(currentVersion) > 0)
                    ),
                    tests = siteLinks.map(link => getHTML(link).then(function (html) {
                        return assertValid(link, html);
                    }));

                return Q.all(tests);
            });
        });
    });
}
