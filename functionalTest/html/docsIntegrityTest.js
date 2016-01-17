'use strict';

var assert = require('assert'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    docs = require('./docs'),
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);

function normalize (text, linesToIgnore) {
    var lines = (text || '').replace(/\r/g, '').split('\n'),
        result = [];

    lines.forEach(function (line) {
        if (!(linesToIgnore || []).some(function (pattern) {
            return new RegExp(pattern).test(line);
        })) {
            result.push(line);
        }
    });

    return result.join('\n').trim();
}

function executeTest (doc) {
    return doc.execute().then(function (spec) {
        spec.steps.forEach(function (step) {
            if (step.verify) {
                var actual = normalize(step.result, step.ignoreLines),
                    expected = normalize(step.verify, step.ignoreLines);

                if (actual !== expected) {
                    console.log('%s %s step %s failed; below is the actual result', doc.endpoint, doc.name, step.id);
                    console.log(normalize(step.result));
                }
                assert.strictEqual(actual, expected);
            }
        });
    });
}

function validateDocs (page) {
    promiseIt(page + ' should be up-to-date', function () {
        return docs.get(page).then(function (doc) {
            var tests = Object.keys(doc).map(function (testName) {
                return executeTest(doc[testName]);
            });
            return Q.all(tests);
        });
    });
}

describe('docs', function () {
    this.timeout(timeout);

    [
        '/docs/api/overview',
        '/docs/api/mocks',
        '/docs/api/proxies',
        '/docs/api/injection',
        '/docs/api/behaviors',
        '/docs/api/xpath',
        '/docs/api/json',
        '/docs/protocols/https',
        '/docs/protocols/http'
    ].forEach(function (page) {
        validateDocs(page);
    });

    if (!isWindows) {
        [
            '/docs/gettingStarted',
            '/docs/api/predicates',
            '/docs/api/stubs',
            '/docs/protocols/tcp'
        ].forEach(function (page) {
            validateDocs(page);
        });
    }
});
