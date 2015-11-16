'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    compatibility = require('../../compatibility'),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient');

describe('tcp imposter', function () {
    if (isWindows) {
        // the DNS resolver errors take a lot longer on Windows
        this.timeout(10000);
    }
    else {
        this.timeout(timeout);
    }

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            var stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'tcp', port: port, stubs: [stub], mode: 'text', name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('client', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'server');
            }).finally(function () {
                return api.del('/imposters');
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
                assert.deepEqual(compatibility.bufferJSON(response), [0, 1, 2, 3]);
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            var stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' } }, { is: { data: 'second' } }]
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
                return api.del('/imposters');
            });
        });

        promiseIt('should only return stubbed response if matches complex predicate', function () {
            var stub = {
                    responses: [{ is: { data: 'MATCH' } }],
                    predicates: [
                        { equals: { data: 'test' } },
                        { startsWith: { data: 'te' } }
                    ]
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
                return api.del('/imposters');
            });
        });

        promiseIt('should return 400 if uses matches predicate with binary mode', function () {
            var stub = {
                    responses: [{ is: { data: 'dGVzdA==' } }],
                    predicates: [{ matches: { data: 'dGVzdA==' } }]
                },
                request = { protocol: 'tcp', port: port, mode: 'binary', stubs: [stub] };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors[0].data, 'the matches predicate is not allowed in binary mode');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should allow proxy stubs', function () {
            var proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
                stub = { responses: [{ proxy: { to: 'tcp://localhost:' + proxyPort } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name + ' MAIN' };

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

        promiseIt('should allow proxy stubs to invalid hosts', function () {
            var stub = { responses: [{ proxy: { to: 'tcp://remotehost:8000' } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                var error = JSON.parse(response).errors[0];
                assert.strictEqual(error.code, 'invalid proxy');
                assert.strictEqual(error.message, 'Cannot resolve "tcp://remotehost:8000"');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

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

        promiseIt('should split each packet into a separate request by default', function () {
            // max 64k packet size, likely to hit max on the loopback interface
            var largeRequest = new Array(65537).join('1') + '2',
                stub = { responses: [{ is: { data: 'success' } }] },
                request = {
                    protocol: 'tcp',
                    port: port,
                    stubs: [stub],
                    mode: 'text',
                    name: this.name
                };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send(largeRequest, port);
            }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                var requests = response.body.requests,
                    dataLength = requests.reduce(function (sum, recordedRequest) {
                        return sum + recordedRequest.data.length;
                    }, 0);
                assert.ok(requests.length > 1);
                assert.strictEqual(65537, dataLength);
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    });
});
