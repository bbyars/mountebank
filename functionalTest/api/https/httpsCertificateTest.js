'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 4000),
    fs = require('fs'),
    client = require('../http/baseHttpClient').create('https');

describe('https imposter', function () {
    this.timeout(timeout);

    promiseIt('should work with mutual auth', function () {
        var request = { protocol: 'https', port: port, mutualAuth: true, name: this.name };

        return api.post('/imposters', request).then(function (response) {
            assert.strictEqual(response.statusCode, 201);
            return client.responseFor({
                method: 'GET',
                path: '/',
                port: port,
                agent: false,
                key: fs.readFileSync(__dirname + '/cert/client-key.pem', 'utf8'),
                cert: fs.readFileSync(__dirname + '/cert/client-cert.pem', 'utf8')
            });
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 200);
        }).finally(function () {
            return api.del('/imposters');
        });
    });
});
