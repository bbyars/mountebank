'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    client = require('../api/http/baseHttpClient').create('http'),
    mb = require('../mb').create(api.port + 1),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('mb replay', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should remove proxies', async function () {
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
        await mb.start(['--allowInjection']);
        await mb.post('/imposters', originServerRequest);
        await mb.post('/imposters', proxyRequest);

        await client.get('/first', proxyPort);
        await client.get('/second', proxyPort);
        await client.get('/first', proxyPort);

        await mb.replay();
        const response = await mb.get(`/imposters/${proxyPort}`),
            stubs = response.body.stubs,
            responses = stubs.map(stub => stub.responses.map(stubResponse => stubResponse.is.body));

        assert.strictEqual(response.body.stubs.length, 2, JSON.stringify(response.body.stubs, null, 2));
        assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
    });
});
