'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    fs = require('fs'),
    path = require('path'),
    client = require('../http/baseHttpClient').create('https'),
    key = fs.readFileSync(path.join(__dirname, '/cert/key.pem'), 'utf8'),
    cert = fs.readFileSync(path.join(__dirname, '/cert/cert.pem'), 'utf8'),
    defaultKey = fs.readFileSync(path.join(__dirname, '../../../src/models/https/cert/mb-key.pem'), 'utf8'),
    defaultCert = fs.readFileSync(path.join(__dirname, '../../../src/models/https/cert/mb-cert.pem'), 'utf8'),
    requestName = 'some request name';

describe('https imposter', () => {
    promiseIt('should support sending key/cert pair during imposter creation', () => {
        const request = {
            protocol: 'https',
            port,
            key,
            cert,
            name: requestName
        };

        return api.post('/imposters', request).then(response => {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.body.key, key);
            assert.strictEqual(response.body.cert, cert);
            return client.get('/', port);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        }).finally(() => api.del('/imposters'));
    });

    promiseIt('should default key/cert pair during imposter creation if not provided', () => {
        const request = { protocol: 'https', port, name: requestName };

        return api.post('/imposters', request).then(response => {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.body.key, defaultKey);
            assert.strictEqual(response.body.cert, defaultCert);
            return client.get('/', port);
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        }).finally(() => api.del('/imposters'));
    });

    promiseIt('should work with mutual auth', () => {
        const request = { protocol: 'https', port, mutualAuth: true, name: requestName };

        return api.post('/imposters', request).then(response => {
            assert.strictEqual(response.statusCode, 201);
            assert.strictEqual(response.body.mutualAuth, true);
            return client.responseFor({
                method: 'GET',
                path: '/',
                port,
                agent: false,
                key,
                cert
            });
        }).then(response => {
            assert.strictEqual(response.statusCode, 200);
        }).finally(() => api.del('/imposters'));
    });

    promiseIt('should support proxying to origin server requiring mutual auth', () => {
        const originServerPort = port + 1,
            originServerRequest = {
                protocol: 'https',
                port: originServerPort,
                stubs: [{ responses: [{ is: { body: 'origin server' } }] }],
                name: `${requestName} origin`,
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
                name: `${requestName} proxy`
            };

        return api.post('/imposters', originServerRequest).then(response => {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return api.post('/imposters', proxyRequest);
        }).then(response => {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
            return client.get('/', port);
        }).then(response => {
            assert.strictEqual(response.body, 'origin server');
        }).finally(() => api.del('/imposters'));
    });
}).timeout(timeout);
