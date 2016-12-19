'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient');

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should support decorating response from origin server', function () {
            var originServerPort = port + 1,
                originServerStub = { responses: [{ is: { data: 'ORIGIN' } }] },
                originServerRequest = {
                    protocol: 'tcp',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: this.name + ' ORIGIN'
                },
                decorator = function (request, response) {
                    response.data += ' DECORATED';
                },
                proxyResponse = {
                    proxy: { to: 'tcp://localhost:' + originServerPort },
                    _behaviors: { decorate: decorator.toString() }
                },
                proxyStub = { responses: [proxyResponse] },
                proxyRequest = { protocol: 'tcp', port: port, stubs: [proxyStub], name: this.name + ' PROXY' };

            return api.post('/imposters', originServerRequest).then(function () {
                return api.post('/imposters', proxyRequest);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'ORIGIN DECORATED');
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    });
});
