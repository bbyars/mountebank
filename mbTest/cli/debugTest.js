'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    tcp = require('../api/tcp/tcpClient'),
    mb = require('../mb').create(api.port + 1),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../baseHttpClient'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http');

describe('--debug', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('tcp server should record matches against stubs', async function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { data: '1' } }, { is: { data: '2' } }] },
            request = { protocol: 'tcp', port: serverPort, stubs: [stub] };
        await mb.start(['--debug']);
        await mb.post('/imposters', request);

        await tcp.send('first', serverPort);
        await tcp.send('second', serverPort);
        const response = await mb.get(`/imposters/${serverPort}`),
            stubs = JSON.stringify(response.body.stubs),
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
    });

    it('http server should record matches against stubs', async function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
            request = { protocol: 'http', port: serverPort, stubs: [stub] };
        await mb.start(['--debug']);
        await mb.post('/imposters', request);

        await http.get('/first?q=1', serverPort);
        await http.get('/second?q=2', serverPort);
        const response = await mb.get(`/imposters/${serverPort}`),
            stubs = JSON.stringify(response.body.stubs),
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
    });

    it('should not record matches against stubs if --debug flag is missing', async function () {
        const serverPort = api.port + 2,
            stub = { responses: [{ is: { body: '1' } }, { is: { body: '2' } }] },
            request = { protocol: 'http', port: serverPort, stubs: [stub] };
        await mb.start();
        await mb.post('/imposters', request);

        await http.get('/first?q=1', serverPort);
        await http.get('/second?q=2', serverPort);
        const response = await mb.get(`/imposters/${serverPort}`);

        assert.deepEqual(response.body.stubs, [{
            responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
            _links: { self: { href: `${mb.url}/imposters/${serverPort}/stubs/0` } }
        }]);
    });

    it('should record final response from out of process proxy', async function () {
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
        await mb.start(['--debug', '--protofile', 'recordMatchTest.json']);
        await mb.post('/imposters', originServerRequest);
        await mb.post('/imposters', proxyServerRequest);
        fs.writeFileSync('recordMatchTest.json', JSON.stringify(protocols, null, 2));

        try {
            await http.get('/', proxyServerPort);
            const response = await mb.get(`/imposters/${proxyServerPort}`),
                matches = response.body.stubs[1].matches;

            matches.forEach(match => {
                delete match.request;
                delete match.timestamp;
            });
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0].response.body, 'ORIGIN');
            assert.deepEqual(matches[0].responseConfig, {
                proxy: { mode: 'proxyOnce', to: `http://localhost:${originServerPort}` }
            });
        }
        finally {
            fs.removeSync('recordMatchTest.json');
        }
    });
});
