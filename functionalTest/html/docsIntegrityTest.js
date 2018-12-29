'use strict';

const Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    docs = require('./docsTester/docs'),
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);

function validateDocs (page) {
    promiseIt(`${page} should be up-to-date`, function () {
        return docs.getScenarios(page).then(testScenarios => {
            const tests = Object.keys(testScenarios).map(testName => testScenarios[testName].assertValid());
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
        '/docs/api/xpath',
        '/docs/api/json',
        '/docs/protocols/https',
        '/docs/protocols/http',
        '/docs/api/jsonpath'
    ].forEach(page => {
        validateDocs(page);
    });

    if (!isWindows) {
        [
            '/docs/gettingStarted',
            '/docs/api/predicates',
            '/docs/api/behaviors',
            '/docs/api/stubs',
            '/docs/protocols/tcp'
        ].forEach(page => {
            validateDocs(page);
        });
    }
});
