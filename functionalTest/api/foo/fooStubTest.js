'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('../tcp/tcpClient'),
    requestName = 'some request name';

describe('foo imposter', () => {
    describe('POST /imposters with stubs', () => {
        promiseIt('should return stubbed response', () => {
            const stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'foo', port, stubs: [stub], name: requestName };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('client', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'server');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', () => {
            const stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' } }, { is: { data: 'second' } }]
                },
                request = { protocol: 'foo', port, stubs: [stub], name: requestName };

            return api.post('/imposters', request).then(() => tcp.send('request', port)
            ).then(response => {
                assert.strictEqual(response.toString(), 'first');
                return tcp.send('request', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'second');
                return tcp.send('request', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'first');
                return tcp.send('request', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'second');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should only return stubbed response if matches complex predicate', () => {
            const stub = {
                    responses: [{ is: { data: 'MATCH' } }],
                    predicates: [
                        { equals: { data: 'test' } },
                        { startsWith: { data: 'te' } }
                    ]
                },
                request = { protocol: 'foo', port, stubs: [stub] };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('not test', port, 100);
            }).then(response => {
                assert.strictEqual(response.toString(), 'foo');
                return tcp.send('test', port, 100);
            }).then(response => {
                assert.strictEqual(response.toString(), 'MATCH');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow proxy stubs', () => {
            const originServerPort = port + 1,
                originServerStub = { responses: [{ is: { data: 'PROXIED' } }] },
                originServerRequest = {
                    protocol: 'foo',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: `${requestName} ORIGIN`
                },
                proxyStub = { responses: [{ proxy: { to: { host: 'localhost', port: originServerPort } } }] },
                proxyRequest = { protocol: 'foo', port, stubs: [proxyStub], name: `${requestName} PROXY` };

            return api.post('/imposters', originServerRequest).then(() => api.post('/imposters', proxyRequest)
            ).then(() => tcp.send('request', port)
            ).then(response => {
                assert.strictEqual(response.toString(), 'PROXIED');
            }).finally(() => api.del('/imposters'));
        });
    });
}).timeout(timeout);
