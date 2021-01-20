'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient'),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters with stubs', function () {
        it('should return stubbed response', async function () {
            const stub = {
                    predicates: [{ equals: { data: 'client' } }],
                    responses: [{ is: { data: 'server' } }]
                },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'text' };
            await api.createImposter(request);

            const response = await tcp.send('client', port);

            assert.strictEqual(response.toString(), 'server');
        });

        it('should allow binary stub responses', async function () {
            const buffer = Buffer.from([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'binary' };
            await api.createImposter(request);

            const response = await tcp.send('0', port);

            assert.ok(Buffer.isBuffer(response));
            assert.deepEqual(response.toJSON().data, [0, 1, 2, 3]);
        });

        it('should allow a sequence of stubs as a circular buffer', async function () {
            const stub = {
                    predicates: [{ equals: { data: 'request' } }],
                    responses: [{ is: { data: 'first' } }, { is: { data: 'second' } }]
                },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const first = await tcp.send('request', port);
            assert.strictEqual(first.toString(), 'first');

            const second = await tcp.send('request', port);
            assert.strictEqual(second.toString(), 'second');

            const third = await tcp.send('request', port);
            assert.strictEqual(third.toString(), 'first');

            const fourth = await tcp.send('request', port);
            assert.strictEqual(fourth.toString(), 'second');
        });

        it('should only return stubbed response if matches complex predicate', async function () {
            const stub = {
                    responses: [{ is: { data: 'MATCH' } }],
                    predicates: [
                        { equals: { data: 'test' } },
                        { startsWith: { data: 'te' } }
                    ]
                },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const first = await tcp.send('not test', port, 100);
            assert.strictEqual(first.toString(), '');

            const second = await tcp.send('test', port, 250);
            assert.strictEqual(second.toString(), 'MATCH');
        });

        it('should return 400 if uses matches predicate with binary mode', async function () {
            const stub = {
                    responses: [{ is: { data: 'dGVzdA==' } }],
                    predicates: [{ matches: { data: 'dGVzdA==' } }]
                },
                request = { protocol: 'tcp', port, mode: 'binary', stubs: [stub] };

            const response = await api.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400, JSON.stringify(response.body, null, 4));
            assert.strictEqual(response.body.errors[0].message, 'the matches predicate is not allowed in binary mode');
        });

        it('should allow proxy stubs', async function () {
            const proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: 'PROXY' },
                stub = { responses: [{ proxy: { to: `tcp://localhost:${proxyPort}` } }] },
                request = { protocol: 'tcp', port, stubs: [stub], name: 'MAIN' };
            await api.createImposter(proxyRequest);
            await api.createImposter(request);

            const response = await tcp.send('request', port);

            assert.strictEqual(response.toString(), 'PROXIED');
        });

        it('should support old proxy syntax for backwards compatibility', async function () {
            const proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: 'PROXY' },
                stub = { responses: [{ proxy: { to: { host: 'localhost', port: proxyPort } } }] },
                request = { protocol: 'tcp', port, stubs: [stub], name: 'MAIN' };
            await api.createImposter(proxyRequest);
            await api.createImposter(request);

            const response = await tcp.send('request', port);

            assert.strictEqual(response.toString(), 'PROXIED');
        });

        it('should allow keepalive proxies', async function () {
            const proxyPort = port + 1,
                proxyStub = { responses: [{ is: { data: 'PROXIED' } }] },
                proxyRequest = { protocol: 'tcp', port: proxyPort, stubs: [proxyStub], name: 'PROXY' },
                stub = { responses: [{ proxy: { to: `tcp://localhost:${proxyPort}`, keepalive: true } }] },
                request = { protocol: 'tcp', port, stubs: [stub], name: 'MAIN' };
            await api.createImposter(proxyRequest);
            await api.createImposter(request);

            const first = await tcp.send('request', port);
            assert.strictEqual(first.toString(), 'PROXIED');

            const second = await tcp.send('request', port);
            assert.strictEqual(second.toString(), 'PROXIED');
        });

        if (!airplaneMode) {
            it('should allow proxy stubs to invalid hosts', async function () {
                const stub = { responses: [{ proxy: { to: 'tcp://remotehost:8000' } }] },
                    request = { protocol: 'tcp', port, stubs: [stub] };
                await api.createImposter(request);

                const response = await tcp.send('request', port),
                    error = JSON.parse(response).errors[0];


                assert.strictEqual(error.code, 'invalid proxy');
                assert.strictEqual(error.message, 'Cannot resolve "tcp://remotehost:8000"');
            });
        }

        it('should split each packet into a separate request by default', async function () {
            // max 64k packet size, likely to hit max on the loopback interface
            const largeRequest = `${new Array(65537).join('1')}2`,
                stub = { responses: [{ is: { data: 'success' } }] },
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'text'
                };
            await api.createImposter(request);

            await tcp.send(largeRequest, port);
            const response = await api.get(`/imposters/${port}`),
                requests = response.body.requests,
                dataLength = requests.reduce((sum, recordedRequest) => sum + recordedRequest.data.length, 0);

            assert.ok(requests.length > 1);
            assert.strictEqual(65537, dataLength);
        });

        it('should support changing default response for stub', async function () {
            const stub = {
                    responses: [{ is: { data: 'Given response' } }],
                    predicates: [{ equals: { data: 'MATCH ME' } }]
                },
                request = {
                    protocol: 'tcp',
                    mode: 'text',
                    port,
                    defaultResponse: { data: 'Default response' },
                    stubs: [stub]
                };
            await api.createImposter(request);

            const first = await tcp.send('MATCH ME', port);
            assert.strictEqual(first.toString(), 'Given response');

            const second = await tcp.send('NO MATCH', port);
            assert.strictEqual(second.toString(), 'Default response');
        });
    });
});
