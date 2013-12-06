'use strict';

var assert = require('assert'),
    validator = require('w3cjs'),
    api = require('../api/api'),
    fs = require('fs');

describe('html validation', function () {
    ['/', '/faqs', '/docs', '/license', '/contributing', '/docs/protocols/http'].forEach(function (endpoint) {
        it(endpoint + ' should have no html errors', function (done) {
            var spec = {
                method: 'GET',
                path: endpoint,
                headers: { accept: 'text/html' }
            };

            api.responseFor(spec).then(function (response) {
                fs.writeFileSync('validation-test.html', response.body);
                validator.validate({
                    file: 'validation-test.html',
                    callback: function (response) {
                        assert.strictEqual(0, response.messages.length, JSON.stringify(response.messages));
                        fs.unlinkSync('validation-test.html');
                        done();
                    }
                });
            });
        });
    });
});
