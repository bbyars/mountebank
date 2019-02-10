'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    hostname = require('os').hostname(),
    BaseHttpClient = require('../api/http/baseHttpClient'),
    http = BaseHttpClient.create('http');

describe('--host', function () {
    this.timeout(timeout);

    promiseIt('should allow binding to specific host', function () {
        return mb.start(['--host', hostname])
            .then(() => http.responseFor({ method: 'GET', path: '/', hostname, port: mb.port }))
            .then(response => {
                const links = response.body._links,
                    hrefs = Object.keys(links).map(key => links[key].href);
                assert.ok(hrefs.length > 0, 'no hrefs to test');
                hrefs.forEach(href => {
                    assert.ok(href.indexOf(`http://${hostname}`) === 0, `${href} does not use hostname`);
                });
            })
            .finally(() => mb.stop());
    });

    promiseIt('should disallow localhost calls when bound to specific host', function () {
        return mb.start(['--host', hostname])
            .then(() => http.responseFor({ method: 'GET', path: '/', hostname: 'localhost', port: mb.port }))
            .then(
                () => { assert.fail('should not have connected'); },
                error => { assert.strictEqual(error.errno, 'ECONNREFUSED'); })
            .finally(() => mb.stop());
    });
});
