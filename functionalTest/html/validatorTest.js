'use strict';

var assert = require('assert'),
    w3cjs = require('w3cjs'),
    api = require('../api/api').create(),
    Q = require('q'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    currentVersion = require('../../package.json').version,
    promiseIt = require('../testHelpers').promiseIt,
    util = require('util');

function assertValid (path, html) {
    var deferred = Q.defer();

    w3cjs.validate({
        input: html,
        callback: function (error, response) {
            if (error) {
                console.log('w3cjs error on ' + path);
                assert.fail(error);
            }
            var errors = (response.messages || []).filter(function (message) {
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
    var docsTestFrameworkTags = ['testScenario', 'step', 'volatile', 'assertResponse', 'change'],
        result = html;

    // ignore errors for webkit attributes on search box
    result = result.replace("results='5' autosave='mb' ", '');

    docsTestFrameworkTags.forEach(function (tagName) {
        var pattern = util.format('<\/?%s[^>]*>', tagName),
            regex = new RegExp(pattern, 'g');
        result = result.replace(regex, '');
    });

    return result;
}

function getHTML (path) {
    var spec = {
        port: api.port,
        method: 'GET',
        path: path,
        headers: { accept: 'text/html' }
    };

    return httpClient.responseFor(spec).then(function (response) {
        assert.strictEqual(response.statusCode, 200, 'Status code for ' + path + ': ' + response.statusCode);

        return Q(removeKnownErrorsFrom(response.body));
    });
}

// MB_AIRPLANE_MODE because these require network access
// MB_RUN_WEB_TESTS because these are slow, occasionally fragile, and there's
// no value running them with every node in the build matrix
if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_RUN_WEB_TESTS === 'true') {
    describe('all pages in the mountebank website', function () {
        this.timeout(60000);

        promiseIt('should be valid html', function () {
            // feed isn't html and is tested elsewhere; support has non-valid Google HTML embedded
            var blacklist = ['/feed', '/support', '/imposters', '/logs'];

            return api.get('/sitemap').then(function (response) {
                assert.strictEqual(response.statusCode, 200);

                var siteLinks = response.body.split('\n').map(function (link) {
                        return link.replace('http://www.mbtest.org', '');
                    }).filter(function (path) {
                        // save time by only checking latest releases, others should be immutable
                        return path !== '' &&
                               blacklist.indexOf(path) < 0 &&
                               (path.indexOf('/releases/') < 0 || path.indexOf(currentVersion) > 0);
                    }),
                    tests = siteLinks.map(function (link) {
                        return getHTML(link).then(function (html) {
                            return assertValid(link, html);
                        });
                    });

                return Q.all(tests);
            });
        });
    });
}
