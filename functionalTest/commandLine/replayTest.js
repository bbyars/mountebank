'use strict';

var assert = require('assert'),
    api = require('../api/api').create(),
    client = require('../api/http/baseHttpClient').create('http'),
    mb = require('../mb').create(api.port + 1),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('mb replay', function () {
    this.timeout(timeout);

    promiseIt('should remove proxies', function () {
        var originServerPort = mb.port + 1,
            originServerFn = function (request, state) {
                state.count = state.count || 0;
                state.count += 1;
                return {
                    body: state.count + '. ' + request.path
                };
            },
            originServerStub = { responses: [{ inject: originServerFn.toString() }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyPort = mb.port + 2,
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyAlways',
                predicateGenerators: [{ matches: { path: true } }]
            },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' proxy' };

        return mb.start(['--allowInjection']).then(function () {
            return mb.post('/imposters', originServerRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return mb.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', proxyPort);
        }).then(function () {
            return client.get('/second', proxyPort);
        }).then(function () {
            return client.get('/first', proxyPort);
        }).then(function () {
            return mb.replay();
        }).then(function () {
            return mb.get('/imposters/' + proxyPort);
        }).then(function (response) {
            assert.strictEqual(response.body.stubs.length, 2, JSON.stringify(response.body.stubs, null, 2));

            var stubs = response.body.stubs,
                responses = stubs.map(function (stub) {
                    return stub.responses.map(function (stubResponse) { return stubResponse.is.body; });
                });

            assert.deepEqual(responses, [['1. /first', '3. /first'], ['2. /second']]);
        }).finally(function () {
            return mb.stop();
        });
    });
});
