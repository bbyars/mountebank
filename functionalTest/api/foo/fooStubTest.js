'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('../tcp/tcpClient');

describe('foo imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should return stubbed response', function () {
            const stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'foo', port, stubs: [stub] };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('client', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'server');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow a sequence of stubs as a circular buffer', function () {
            const stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' } }, { is: { data: 'second' } }]
                },
                request = { protocol: 'foo', port, stubs: [stub] };

            return api.post('/imposters', request).then(() => tcp.send('request', port)).then(response => {
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

        promiseIt('should only return stubbed response if matches complex predicate', function () {
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

        promiseIt('should allow proxy stubs', function () {
            const originServerPort = port + 1,
                originServerStub = { responses: [{ is: { data: 'PROXIED' } }] },
                originServerRequest = {
                    protocol: 'foo',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'ORIGIN'
                },
                proxyStub = { responses: [{ proxy: { to: 'tcp://localhost:' + originServerPort } }] },
                proxyRequest = { protocol: 'foo', port, stubs: [proxyStub], name: 'PROXY' };

            return api.post('/imposters', originServerRequest)
                .then(() => api.post('/imposters', proxyRequest))
                .then(() => tcp.send('request', port))
                .then(response => {
                    assert.strictEqual(response.toString(), 'PROXIED');
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should record new stubs in order in front of proxy resolver using proxyOnce mode', function () {
            const originServerPort = port + 1,
                originServerFn = (request, state) => {
                    state.count = state.count || 0;
                    state.count += 1;
                    return { data: `${state.count}. ${request.data}` };
                },
                originServerStub = { responses: [{ inject: originServerFn.toString() }] },
                originServerRequest = {
                    protocol: 'foo',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'ORIGIN'
                },
                proxyDefinition = {
                    to: `tcp://localhost:${originServerPort}`,
                    mode: 'proxyOnce',
                    predicateGenerators: [{ matches: { data: true } }]
                },
                proxyStub = { responses: [{ proxy: proxyDefinition }] },
                proxyRequest = { protocol: 'foo', port, stubs: [proxyStub], name: 'PROXY' };

            return api.post('/imposters', originServerRequest).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return api.post('/imposters', proxyRequest);
            }).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return tcp.send('FIRST', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '1. FIRST');
                return tcp.send('SECOND', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '2. SECOND');
                return tcp.send('THIRD', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '3. THIRD');
                return tcp.send('FIRST', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '1. FIRST');
                return tcp.send('SECOND', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '2. SECOND');
                return tcp.send('THIRD', port);
            }).then(response => {
                assert.strictEqual(response.toString('utf8'), '3. THIRD');
                return api.del(`/imposters/${port}`);
            }).then(response => {
                assert.strictEqual(response.body.stubs.length, 4);
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should record new stubs with multiple responses behind proxy resolver in proxyAlways mode', function () {
            const originServerPort = port + 1,
                originServerFn = (request, state) => {
                    state.count = state.count || 0;
                    state.count += 1;
                    return { data: `${state.count}. ${request.data}` };
                },
                originServerStub = { responses: [{ inject: originServerFn.toString() }] },
                originServerRequest = {
                    protocol: 'foo',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'ORIGIN'
                },
                proxyDefinition = {
                    to: `tcp://localhost:${originServerPort}`,
                    mode: 'proxyAlways',
                    predicateGenerators: [{ matches: { data: true } }]
                },
                proxyStub = { responses: [{ proxy: proxyDefinition }] },
                proxyRequest = { protocol: 'foo', port, stubs: [proxyStub], name: 'PROXY' };

            return api.post('/imposters', originServerRequest)
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return api.post('/imposters', proxyRequest);
                })
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    return tcp.send('FIRST', port);
                })
                .then(() => tcp.send('SECOND', port))
                .then(() => tcp.send('FIRST', port))
                .then(() => api.del(`/imposters/${port}`))
                .then(response => {
                    assert.strictEqual(response.body.stubs.length, 3, JSON.stringify(response.body.stubs, null, 2));

                    const stubs = response.body.stubs,
                        responses = stubs.splice(1).map(stub => stub.responses.map(stubResponse => stubResponse.is.data));

                    assert.deepEqual(responses, [['1. FIRST', '3. FIRST'], ['2. SECOND']]);
                })
                .finally(() => api.del('/imposters'));
        });
    });
});
