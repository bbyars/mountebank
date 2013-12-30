'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000),
    tcp = require('./client');

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            var stub = {
                    predicates: { data: { is: 'client' }},
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'tcp', port: port, stubs: [stub], mode: 'text', name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('client', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'server');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow binary stub responses', function () {
            var buffer = new Buffer([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], mode: 'binary', name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send('0', port);
            }).then(function (response) {
                assert.ok(Buffer.isBuffer(response));
                assert.deepEqual(response.toJSON(), [0, 1, 2, 3]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            var stub = {
                    predicates: { data: { is: 'request' }},
                    responses: [{ is: { data: 'first' }}, { is: { data: 'second' }}]
                },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

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
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should only return stubbed response if matches complex predicate', function () {
            var stub = {
                    responses: [{ is: { data: 'MATCH' }}],
                    predicates: {
                        data: { is: 'test' },
                        requestFrom: { startsWith: '127.0.0.1' }
                    }
                },
                request = { protocol: 'tcp', port: port, stubs: [stub] };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('not test', port, 100);
            }).then(function (response) {
                assert.strictEqual(response.toString(), '');

                return tcp.send('test', port, 100);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'MATCH');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow proxy stubs', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                stub = { responses: [{ proxy: { host: 'localhost', port:  proxyPort } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name + ' MAIN' };

            return api.post('/imposters', proxyRequest).then(function () {
                return api.post('/imposters', request);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'PROXIED');
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow proxy stubs to invalid hosts', function () {
            var stub = { responses: [{ proxy: { host: 'remotehost', port: 8000 } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.deepEqual(JSON.parse(response), { errors: [{
                    code: 'invalid proxy',
                    message: 'Cannot resolve {"host":"remotehost","port":8000}'
                }]});
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should allow proxyOnce behavior', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                stub = { responses: [{ proxyOnce: { host: 'localhost', port: proxyPort } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', proxyRequest).then(function () {
                return api.post('/imposters', request);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'PROXIED');

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'PROXIED');

                return api.get('/imposters/' + proxyPort);
            }).then(function (response) {
                assert.strictEqual(response.body.requests.length, 1);
            }).finally(function () {
                return api.del('/imposters/' + proxyPort);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should save proxyOnce state between stub creations', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                stub = { responses: [{ proxyOnce: { host: 'localhost', port: proxyPort } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', proxyRequest).then(function () {
                return api.post('/imposters', request);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function () {
                return api.del('/imposters/' + proxyPort);
            }).then(function () {
                return api.del('/imposters/' + port);
            }).then(function (response) {
                // replay the imposter body without change, and with the proxy shut down
                return api.post('/imposters', response.body);
            }).then(function (response) {
                assert.strictEqual(201, response.statusCode, JSON.stringify(response.body));

                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'PROXIED');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
