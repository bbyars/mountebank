'use strict';

var assert = require('assert'),
    validator = require('w3cjs'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    fs = require('fs'),
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 3000);

describe('html validation', function () {
    this.timeout(timeout);

    ['/', '/faqs', '/docs', '/license', '/contributing', '/config', '/docs/protocols/http'].forEach(function (endpoint) {
        it(endpoint + ' should have no html errors', function (done) {
            var spec = {
                method: 'GET',
                path: endpoint,
                headers: { accept: 'text/html' }
            };

            httpClient.responseFor(spec).then(function (response) {
                fs.writeFileSync('validation-test.html', response.body);
                validator.validate({
                    file: 'validation-test.html',
                    callback: function (response) {
                        fs.unlinkSync('validation-test.html');
                        assert.strictEqual(0, response.messages.length, JSON.stringify(response.messages));
                        done();
                    }
                });
            });
        });
    });
});
