'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    tcp = require('../api/tcp/tcpClient'),
    mb = require('../mb').create(api.port + 1),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http');

describe('--debug', function () {
    this.timeout(timeout);

    promiseIt('tcp server should record matches against stubs', function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { data: '1' } }, { is: { data: '2' } }] },
            request = { protocol: 'tcp', port: serverPort, stubs: [stub] };

        return mb.start(['--debug'])
            .then(() => mb.post('/imposters', request))
            .then(() => tcp.send('first', serverPort))
            .then(() => tcp.send('second', serverPort))
            .then(() => mb.get(`/imposters/${serverPort}`))
            .then(response => {
                const stubs = JSON.stringify(response.body.stubs),
                    scrubbed = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"')
                        .replace(/"processingTime":\d+/g, '"processingTime":0')
                        .replace(/"requestFrom":"[a-f:.\d]+"/g, '"requestFrom":"HERE"'),
                    actualWithoutEphemeralData = JSON.parse(scrubbed);

                assert.deepEqual(actualWithoutEphemeralData, [{
                    responses: [{ is: { data: '1' } }, { is: { data: '2' } }],
                    matches: [
                        {
                            timestamp: 'NOW',
                            request: { requestFrom: 'HERE', data: 'first', ip: '::ffff:127.0.0.1' },
                            response: { data: '1' },
                            responseConfig: { is: { data: '1' } },
                            processingTime: 0
                        },
                        {
                            timestamp: 'NOW',
                            request: { requestFrom: 'HERE', data: 'second', ip: '::ffff:127.0.0.1' },
                            response: { data: '2' },
                            responseConfig: { is: { data: '2' } },
                            processingTime: 0
                        }
                    ],
                    _links: { self: { href: `${mb.url}/imposters/${serverPort}/stubs/0` } }
                }]);
            })
            .finally(() => mb.stop());
    });

    promiseIt('http server should record matches against stubs', function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
            request = { protocol: 'http', port: serverPort, stubs: [stub] };

        return mb.start(['--debug'])
            .then(() => mb.post('/imposters', request))
            .then(() => http.get('/first?q=1', serverPort))
            .then(() => http.get('/second?q=2', serverPort))
            .then(() => mb.get(`/imposters/${serverPort}`))
            .then(response => {
                const stubs = JSON.stringify(response.body.stubs),
                    scrubbed = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"')
                        .replace(/"processingTime":\d+/g, '"processingTime":0')
                        .replace(/"requestFrom":"[a-f:.\d]+"/g, '"requestFrom":"HERE"'),
                    actualWithoutEphemeralData = JSON.parse(scrubbed),
                    requestHeaders = { accept: 'application/json', Host: `localhost:${serverPort}`, Connection: 'keep-alive' };

                assert.deepEqual(actualWithoutEphemeralData, [{
                    responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
                    matches: [
                        {
                            timestamp: 'NOW',
                            request: {
                                requestFrom: 'HERE',
                                path: '/first',
                                query: { q: '1' },
                                method: 'GET',
                                headers: requestHeaders,
                                ip: '::ffff:127.0.0.1',
                                body: ''
                            },
                            response: {
                                body: '1'
                            },
                            responseConfig: {
                                is: { body: '1' }
                            },
                            processingTime: 0
                        },
                        {
                            timestamp: 'NOW',
                            request: {
                                requestFrom: 'HERE',
                                path: '/second',
                                query: { q: '2' },
                                method: 'GET',
                                headers: requestHeaders,
                                ip: '::ffff:127.0.0.1',
                                body: ''
                            },
                            response: {
                                body: '2'
                            },
                            responseConfig: {
                                is: { body: '2' }
                            },
                            processingTime: 0
                        }
                    ],
                    _links: { self: { href: `${mb.url}/imposters/${serverPort}/stubs/0` } }
                }]);
            })
            .finally(() => mb.stop());
    });

    promiseIt('should not record matches against stubs if --debug flag is missing', function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
            request = { protocol: 'http', port: serverPort, stubs: [stub] };

        return mb.start()
            .then(() => mb.post('/imposters', request))
            .then(() => http.get('/first?q=1', serverPort))
            .then(() => http.get('/second?q=2', serverPort))
            .then(() => mb.get(`/imposters/${serverPort}`))
            .then(response => {
                assert.deepEqual(response.body.stubs, [{
                    responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
                    _links: { self: { href: `${mb.url}/imposters/${serverPort}/stubs/0` } }
                }]);
            })
            .finally(() => mb.stop());
    });

    promiseIt('should record final response from out of process proxy', function () {
        const originServerPort = api.port + 2,
            originServerStub = { responses: [{ is: { body: 'ORIGIN' } }] },
            originServerRequest = { protocol: 'http', port: originServerPort, stubs: [originServerStub] },
            proxyServerPort = api.port + 3,
            proxyServerStub = { responses: [{ proxy: { to: `http://localhost:${originServerPort}` } }] },
            proxyServerRequest = { protocol: 'http', port: proxyServerPort, stubs: [proxyServerStub] },
            protocols = {
                http: { createCommand: 'node src/models/http/index.js' }
            },
            fs = require('fs-extra');

        fs.writeFileSync('recordMatchTest.json', JSON.stringify(protocols, null, 2));

        return mb.start(['--debug', '--protofile', 'recordMatchTest.json'])
            .then(() => mb.post('/imposters', originServerRequest))
            .then(() => mb.post('/imposters', proxyServerRequest))
            .then(() => http.get('/', proxyServerPort))
            .then(() => mb.get(`/imposters/${proxyServerPort}`))
            .then(response => {
                const matches = response.body.stubs[1].matches;
                matches.forEach(match => {
                    delete match.request;
                    delete match.timestamp;
                });
                assert.strictEqual(matches.length, 1);
                assert.strictEqual(matches[0].response.body, 'ORIGIN');
                assert.deepEqual(matches[0].responseConfig, {
                    proxy: { mode: 'proxyOnce', to: `http://localhost:${originServerPort}` }
                });
            })
            .then(() => fs.removeSync('recordMatchTest.json'))
            .finally(() => mb.stop());
    });
});
