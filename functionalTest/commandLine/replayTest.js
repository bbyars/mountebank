'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    client = require('../api/http/baseHttpClient').create('http'),
    mb = require('../mb').create(api.port + 1),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('mb replay', () => {
    promiseIt('should remove proxies', () => {
        const originServerPort = mb.port + 1,
            originServerFn = (request, state) => {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: `${state.count}. ${request.path}`
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: 'origin server'
            },
            proxyPort = mb.port + 2,
            proxyDefinition = {
                to: `http://localhost:${originServerPort}`,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: 'PROXY' };

        return mb.start(['--allowInjection']).then(() => mb.post('/imposters', originServerRequest)).then(response => {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return mb.post('/imposters', proxyRequest);
        }).then(response => {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', proxyPort);
        }).then(() => client.get('/second', proxyPort)).then(() => client.get('/first', proxyPort)).then(() => mb.replay()).then(() => mb.get(`/imposters/${proxyPort}`)).then(response => {
            assert.strictEqual(response.body.stubs.length, 2, JSON.stringify(response.body.stubs, null, 2));

            const stubs = response.body.stubs,
                responses = stubs.map(stub => stub.responses.map(stubResponse => stubResponse.is.body));

            assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
        }).finally(() => mb.stop());
    });
}).timeout(timeout);
