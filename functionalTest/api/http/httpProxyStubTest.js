'use strict';

var assert = require('assert'),
    api = require('../api'),
    client = require('./baseHttpClient').create('http'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000);

describe('http proxy stubs', function () {
    this.timeout(timeout);

    promiseIt('should allow proxy stubs', function () {
        var proxyPort = port + 1,
            proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
            stub = { responses: [{ proxy: { to: 'http://localhost:' + proxyPort } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name + ' MAIN' };

        return api.post('/imposters', proxyRequest).then(function () {
            return api.post('/imposters', request);
        }).then(function () {
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'PROXIED');
        }).finally(function () {
            return api.del('/imposters/' + proxyPort);
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should allow proxy stubs to invalid domains', function () {
        var stub = { responses: [{ proxy: { to: 'http://invalid.domain' } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

        return api.post('/imposters', request).then(function () {
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 500);
            assert.strictEqual(response.body.errors[0].code, 'invalid proxy');
            assert.strictEqual(response.body.errors[0].message, 'Cannot resolve "http://invalid.domain"');
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should allow proxyOnce behavior', function () {
        var proxyPort = port + 1,
            proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
            stub = { responses: [{ proxyOnce: { to: 'http://localhost:' + proxyPort } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name + ' MAIN' };

        return api.post('/imposters', proxyRequest).then(function () {
            return api.post('/imposters', request);
        }).then(function () {
            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'PROXIED');

            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'PROXIED');

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
            proxyStub = { responses: [{ is: { body: 'PROXIED' } }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub], name: this.name + ' PROXY' },
            stub = { responses: [{ proxyOnce: { to: 'http://localhost:' + proxyPort } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name + ' MAIN' };

        return api.post('/imposters', proxyRequest).then(function () {
            return api.post('/imposters', request);
        }).then(function () {
            return client.get('/', port);
        }).then(function () {
            return api.del('/imposters/' + proxyPort);
        }).then(function () {
            return api.del('/imposters/' + port);
        }).then(function (response) {
            // replay the imposter body without change, and with the proxy shut down
            return api.post('/imposters', response.body);
        }).then(function (response) {
            assert.strictEqual(201, response.statusCode, JSON.stringify(response.body));

            return client.get('/', port);
        }).then(function (response) {
            assert.strictEqual('PROXIED', response.body);
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should set predicates automatically when using proxyAll', function () {
        var proxyPort = port + 1,
            proxyStubs = [
                {
                    predicates: { path: { is: '/first' } },
                    responses: [{ is: { body: 'first' }}]
                },
                {
                    predicates: { path: { is: '/second' } },
                    responses: [{ is: { body: 'second' }}]
                }
            ],
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: proxyStubs, name: this.name + ' PROXY' },
            stub = { responses: [{ proxyAll: { to: 'http://localhost:' + proxyPort, remember: ['path'] } }] },
            request = { protocol: 'http', port: port, stubs: [stub], name: this.name + ' MAIN' };

        return api.post('/imposters', proxyRequest).then(function () {
            return api.post('/imposters', request);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'second');
            return api.del('/imposters/' + proxyPort);
        }).then(function () {
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, 'second');
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should record new stubs in order in front of proxy resolver in proxyOnce mode', function () {
        var originServerPort = port + 1,
            originServerFn = 'function (request, state) {\n' +
                             '    state.count = state.count || 0;\n' +
                             '    state.count += 1;\n' +
                             '    return {\n' +
                             '        body: state.count + ". " + request.method + " " + request.path\n' +
                             '    };\n' +
                             '}',
            originServerStub = { responses: [{ inject: originServerFn }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyOnce',
                replayWhen: {
                    method: { matches: true },
                    path: { matches: true }
                }
            },
            proxyStub = { responses: [{ proxyX: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. GET /first');
            return client.del('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. DELETE /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. GET /second');
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. GET /first');
            return client.del('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. DELETE /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. GET /second');
            return api.del('/imposters/' + originServerPort);
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should record new stubs behind proxy resolver in proxyAlways mode', function () {
        var originServerPort = port + 1,
            originServerFn = 'function (request, state) {\n' +
                             '    state.count = state.count || 0;\n' +
                             '    state.count += 1;\n' +
                             '    return {\n' +
                             '        body: state.count + ". " + request.method + " " + request.path\n' +
                             '    };\n' +
                             '}',
            originServerStub = { responses: [{ inject: originServerFn }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyAlways',
                replayWhen: {
                    path: { matches: true }
                }
            },
            proxyStub = { responses: [{ proxyX: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. GET /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. GET /second');
            return client.get('/first', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. GET /first');
            return client.get('/second', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '4. GET /second');
            return api.del('/imposters/' + originServerPort);
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });

    promiseIt('should match entire object graphs', function () {
        var originServerPort = port + 1,
            originServerFn = 'function (request, state) {\n' +
                             '    state.count = state.count || 0;\n' +
                             '    state.count += 1;\n' +
                             ' console.log(JSON.stringify(request));\n' +
                             '    return {\n' +
                             '        body: state.count + ". " + JSON.stringify(request.query)\n' +
                             '    };\n' +
                             '}',
            originServerStub = { responses: [{ inject: originServerFn }] },
            originServerRequest = {
                protocol: 'http',
                port: originServerPort,
                stubs: [originServerStub],
                name: this.name + ' origin server'
            },
            proxyDefinition = {
                to: 'http://localhost:' + originServerPort,
                mode: 'proxyOnce',
                replayWhen: {
                    query: { matches: true }
                }
            },
            proxyStub = { responses: [{ proxyX: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: port, stubs: [proxyStub], name: this.name + ' proxy' };

        return api.post('/imposters', originServerRequest).then(function () {
            return api.post('/imposters', proxyRequest);
        }).then(function (response) {
            assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
            return client.get('/?first=1&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return client.get('/?first=1', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '2. {"first":"1"}');
            return client.get('/?first=2&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '3. {"first":"2","second":"2"}');
            return client.get('/?first=1&second=2', port);
        }).then(function (response) {
            assert.strictEqual(response.body, '1. {"first":"1","second":"2"}');
            return api.del('/imposters/' + originServerPort);
        }).finally(function () {
            return api.del('/imposters/' + port);
        });
    });
});
