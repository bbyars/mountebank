'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000),
    tcp = require('../tcp/tcpClient');

describe('foo imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            var stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'foo', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('client', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'server');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            var stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' }}, { is: { data: 'second' }}]
                },
                request = { protocol: 'foo', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'first');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'second');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'first');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'second');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should only return stubbed response if matches complex predicate', function () {
            var stub = {
                    responses: [{ is: { data: 'MATCH' }}],
                    predicates: [
                        { equals: { data: 'test' } },
                        { startsWith: { requestFrom: '127.0.0.1' } }
                    ]
                },
                request = { protocol: 'foo', port: port, stubs: [stub] };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('not test', port, 100);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'foo');

                return tcp.send('test', port, 100);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'MATCH');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should allow proxy stubs', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'foo', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                stub = { responses: [{ proxy: { to: { host: 'localhost', port:  proxyPort } } }] },
                request = { protocol: 'foo', port: port, stubs: [stub], name: this.name + ' MAIN' };

            return api.post('/imposters', proxyRequest).then(function () {
                return api.post('/imposters', request);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'PROXIED');
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    });
});
