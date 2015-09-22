'use strict';

var assert = require('assert'),
    w3cjs = require('w3cjs'),
    api = require('../api/api'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    fs = require('fs'),
    timeout = 10000;

// MB_AIRPLANE_MODE because these require network access
// MB_SKIP_W3C_TESTS because these are slow, occasionally fragile, and there's
// no value running them with every node in the build matrix
if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_SKIP_W3C_TESTS !== 'true') {
    describe('html validation', function () {
        this.timeout(timeout);

        [
            '/contributing',
            '/license',
            '/faqs',
            '/thoughtworks',
            '/docs/examples',
            '/docs/gettingStarted',
            '/docs/install',
            '/docs/glossary',
            '/docs/commandLine',
            '/docs/clientLibraries',
            '/docs/api/overview',
            '/docs/api/mocks',
            '/docs/api/stubs',
            '/docs/api/predicates',
            '/docs/api/proxies',
            '/docs/api/injection',
            '/docs/api/behaviors',
            '/docs/api/errors',
            '/docs/protocols/http',
            '/docs/protocols/https',
            '/docs/protocols/tcp',
            '/docs/protocols/smtp',
            '/releases',
            '/releases/v1.3.0' // save time by only checking latest releases, others should be immutable
        ].forEach(function (endpoint) {
            it(endpoint + ' should have no html errors', function (done) {
                var spec = {
                    port: api.port,
                    method: 'GET',
                    path: endpoint,
                    headers: { accept: 'text/html' }
                };

                httpClient.responseFor(spec).then(function (response) {
                    // ignore errors for webkit attributes on search box
                    // use unique filename each time because otherwise a timed out test
                    // causes the next test(s) to fail
                    var body = response.body.replace("results='5' autosave='mb' ", ''),
                        filename = endpoint.replace(/\//g, '') + '-validation-test.html';
                    fs.writeFileSync(filename, body);

                    w3cjs.validate({
                        file: filename,
                        callback: function (response) {
                            fs.unlinkSync(filename);

                            if (response.messages) {
                                var errors = response.messages.filter(function (message) {
                                    return message.type === 'error';
                                }).map(function (message) {
                                    return {
                                        line: message.lastLine,
                                        message: message.message
                                    };
                                });
                                assert.strictEqual(0, errors.length, JSON.stringify(errors, null, 2));
                            }
                            else {
                                console.warn('HTML validation skipped for ' + endpoint);
                            }
                            done();
                        }
                    });
                });
            });
        });
    });
}
