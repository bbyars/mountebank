'use strict';

var assert = require('assert'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    docs = require('./docs'),
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 3000);

function normalize (text, linesToIgnore) {
    text = (text || '').replace(/\r/g, '');
    linesToIgnore = linesToIgnore || [];

    var lines = text.split('\n'),
        result = [];

    lines.forEach(function (line) {
        if (!linesToIgnore.some(function (pattern) {
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
                    console.log("%s %s step %s failed; below is the actual result", doc.endpoint, doc.name, step.id);
                    console.log(actual);
                }
                assert.strictEqual(actual, expected);
            }
        });
    });
}

describe('docs', function () {
    this.timeout(timeout);

    var pages = [
        '/docs/gettingStarted',
        '/docs/api/overview',
        '/docs/api/mocks',
        '/docs/api/stubs',
        '/docs/api/predicates',
        '/docs/api/proxies',
        '/docs/api/injection'
    ];

    pages.forEach(function (page) {
        promiseIt(page + ' should be up-to-date', function () {
            return docs.get(page).then(function (docs) {
                var tests = Object.keys(docs).map(function (testName) {
                    return executeTest(docs[testName]);

                });
                return Q.all(tests);
            });
        });
    });
});
