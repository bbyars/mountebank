'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    fs = require('fs-extra'),
    path = require('path'),
    client = require('../../baseHttpClient').create('https'),
    key = fs.readFileSync(path.join(__dirname, '/cert/key.pem'), 'utf8'),
    cert = fs.readFileSync(path.join(__dirname, '/cert/cert.pem'), 'utf8');

describe('https imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    it('should support sending key/cert pair during imposter creation', async function () {
        const request = {
            protocol: 'https',
            port,
            key,
            cert
        };

        const creationResponse = await api.createImposter(request);
        assert.strictEqual(creationResponse.body.key, key);
        assert.strictEqual(creationResponse.body.cert, cert);

        const response = await client.get('/', port);
        assert.strictEqual(response.statusCode, 200);
    });

    it('should default key/cert pair during imposter creation if not provided', async function () {
        const request = { protocol: 'https', port };
        await api.createImposter(request);

        const response = await client.get('/', port);

        assert.strictEqual(response.statusCode, 200);
    });

    it('should work with mutual auth', async function () {
        const request = { protocol: 'https', port, mutualAuth: true };

        const creationResponse = await api.createImposter(request);
        assert.strictEqual(creationResponse.body.mutualAuth, true);

        const response = await client.responseFor({
            method: 'GET',
            path: '/',
            port,
            agent: false,
            key,
            cert
        });
        assert.strictEqual(response.statusCode, 200);
    });

    it('should support proxying to origin server requiring mutual auth', async function () {
        const originServerPort = port + 1,
            originServerRequest = {
                protocol: 'https',
                port: originServerPort,
                stubs: [{ responses: [{ is: { body: 'origin server' } }] }],
                name: 'origin',
                mutualAuth: true
            },
            proxy = {
                to: `https://localhost:${originServerPort}`,
                key,
                cert
            },
            proxyRequest = {
                protocol: 'https',
                port,
                stubs: [{ responses: [{ proxy: proxy }] }],
                name: 'proxy'
            };
        await api.createImposter(originServerRequest);
        await api.createImposter(proxyRequest);

        const response = await client.get('/', port);

        assert.strictEqual(response.body, 'origin server');
    });
});
