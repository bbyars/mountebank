'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient'),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            const stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'text' };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('client', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'server');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow binary stub responses', function () {
            const buffer = Buffer.from([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'binary' };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send('0', port);
            }).then(response => {
                assert.ok(Buffer.isBuffer(response));
                assert.deepEqual(response.toJSON().data, [0, 1, 2, 3]);
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            const stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' } }, { is: { data: 'second' } }]
                },
                request = { protocol: 'tcp', port, stubs: [stub] };

            return api.post('/imposters', request)
                .then(() => tcp.send('request', port))
                .then(response => {
                    assert.strictEqual(response.toString(), 'first');
                    return tcp.send('request', port);
                })
                .then(response => {
                    assert.strictEqual(response.toString(), 'second');
                    return tcp.send('request', port);
                })
                .then(response => {
                    assert.strictEqual(response.toString(), 'first');
                    return tcp.send('request', port);
                })
                .then(response => {
                    assert.strictEqual(response.toString(), 'second');
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should only return stubbed response if matches complex predicate', function () {
            const stub = {
                    responses: [{ is: { data: 'MATCH' } }],
                    predicates: [
                        { equals: { data: 'test' } },
                        { startsWith: { data: 'te' } }
                    ]
                },
                request = { protocol: 'tcp', port, stubs: [stub] };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('not test', port, 100);
            }).then(response => {
                assert.strictEqual(response.toString(), '');

                return tcp.send('test', port, 100);
            }).then(response => {
                assert.strictEqual(response.toString(), 'MATCH');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should return 400 if uses matches predicate with binary mode', function () {
            const stub = {
                    responses: [{ is: { data: 'dGVzdA==' } }],
                    predicates: [{ matches: { data: 'dGVzdA==' } }]
                },
                request = { protocol: 'tcp', port, mode: 'binary', stubs: [stub] };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 400, JSON.stringify(response.body, null, 4));
                assert.strictEqual(response.body.errors[0].message, 'the matches predicate is not allowed in binary mode');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow proxy stubs', function () {
            const proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: 'PROXY' },
                stub = { responses: [{ proxy: { to: `tcp://localhost:${proxyPort}` } }] },
                request = { protocol: 'tcp', port, stubs: [stub], name: 'MAIN' };

            return api.post('/imposters', proxyRequest)
                .then(() => api.post('/imposters', request))
                .then(() => tcp.send('request', port))
                .then(response => {
                    assert.strictEqual(response.toString(), 'PROXIED');
                }).finally(() => api.del('/imposters'));
        });

        promiseIt('should support old proxy syntax for backwards compatibility', function () {
            const proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: 'PROXY' },
                stub = { responses: [{ proxy: { to: { host: 'localhost', port: proxyPort } } }] },
                request = { protocol: 'tcp', port, stubs: [stub], name: 'MAIN' };

            return api.post('/imposters', proxyRequest)
                .then(() => api.post('/imposters', request))
                .then(() => tcp.send('request', port))
                .then(response => {
                    assert.strictEqual(response.toString(), 'PROXIED');
                }).finally(() => api.del('/imposters'));
        });

        if (!airplaneMode) {
            promiseIt('should allow proxy stubs to invalid hosts', function () {
                const stub = { responses: [{ proxy: { to: 'tcp://remotehost:8000' } }] },
                    request = { protocol: 'tcp', port, stubs: [stub] };

                return api.post('/imposters', request)
                    .then(() => tcp.send('request', port))
                    .then(response => {
                        const error = JSON.parse(response).errors[0];
                        assert.strictEqual(error.code, 'invalid proxy');
                        assert.strictEqual(error.message, 'Cannot resolve "tcp://remotehost:8000"');
                    })
                    .finally(() => api.del('/imposters'));
            });
        }

        promiseIt('should split each packet into a separate request by default', function () {
            // max 64k packet size, likely to hit max on the loopback interface
            const largeRequest = `${new Array(65537).join('1')}2`,
                stub = { responses: [{ is: { data: 'success' } }] },
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'text'
                };

            return api.post('/imposters', request)
                .then(response => {
                    assert.strictEqual(response.statusCode, 201);
                    return tcp.send(largeRequest, port);
                })
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
                    const requests = response.body.requests,
                        dataLength = requests.reduce((sum, recordedRequest) => sum + recordedRequest.data.length, 0);
                    assert.ok(requests.length > 1);
                    assert.strictEqual(65537, dataLength);
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should support changing default response for stub', function () {
            const stub = {
                    responses: [{ is: { data: 'Given response' } }],
                    predicates: [{ equals: { data: 'MATCH ME' } }]
                },
                request = {
                    protocol: 'tcp',
                    mode: 'text',
                    port,
                    defaultResponse: { data: 'Default response' },
                    stubs: [stub]
                };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, response.body);
                return tcp.send('MATCH ME', port);
            }).then(response => {
                assert.strictEqual('Given response', response.toString());
                return tcp.send('NO MATCH', port);
            }).then(response => {
                assert.strictEqual('Default response', response.toString());
            }).finally(() => api.del('/imposters'));
        });
    });
});
