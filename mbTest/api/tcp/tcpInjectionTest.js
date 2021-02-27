'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    tcp = require('./tcpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('tcp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters with injections', function () {
        it('should allow javascript predicate for matching (old interface)', async function () {
            const fn = request => request.data.toString() === 'test',
                stub = {
                    predicates: [{ inject: fn.toString() }],
                    responses: [{ is: { data: 'MATCHED' } }]
                };
            await api.createImposter({ protocol: 'tcp', port, stubs: [stub] });

            const response = await tcp.send('test', port);

            assert.strictEqual(response.toString(), 'MATCHED');
        });

        it('should allow javascript predicate for matching', async function () {
            const fn = config => config.request.data.toString() === 'test',
                stub = {
                    predicates: [{ inject: fn.toString() }],
                    responses: [{ is: { data: 'MATCHED' } }]
                };
            await api.createImposter({ protocol: 'tcp', port, stubs: [stub] });

            const response = await tcp.send('test', port);

            assert.strictEqual(response.toString(), 'MATCHED');
        });

        it('should allow synchronous javascript injection for responses (old interface)', async function () {
            const fn = request => ({ data: `${request.data} INJECTED` }),
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const response = await tcp.send('request', port);

            assert.strictEqual(response.toString(), 'request INJECTED');
        });

        it('should allow synchronous javascript injection for responses', async function () {
            const fn = config => ({ data: `${config.request.data} INJECTED` }),
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const response = await tcp.send('request', port);

            assert.strictEqual(response.toString(), 'request INJECTED');
        });

        it('should allow javascript injection to keep state between requests (old interface)', async function () {
            const fn = (request, state) => {
                    if (!state.calls) { state.calls = 0; }
                    state.calls += 1;
                    return { data: state.calls.toString() };
                },
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const first = await tcp.send('request', port);
            assert.strictEqual(first.toString(), '1');

            const second = await tcp.send('request', port);
            assert.deepEqual(second.toString(), '2');
        });

        it('should allow javascript injection to keep state between requests', async function () {
            const fn = config => {
                    if (!config.state.calls) { config.state.calls = 0; }
                    config.state.calls += 1;
                    return { data: config.state.calls.toString() };
                },
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };
            await api.createImposter(request);

            const first = await tcp.send('request', port);
            assert.strictEqual(first.toString(), '1');

            const second = await tcp.send('request', port);
            assert.deepEqual(second.toString(), '2');
        });

        it('should allow asynchronous injection (old interface)', async function () {
            const originServerPort = port + 1,
                originServerStub = { responses: [{ is: { body: 'origin server' } }] },
                originServerRequest = {
                    protocol: 'http',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'origin'
                },
                fn = (request, state, logger, callback) => {
                    const net = require('net'),
                        options = {
                            host: '127.0.0.1',
                            port: '$PORT'
                        },
                        socket = net.connect(options, () => {
                            socket.write(`${request.data}\n`);
                        });
                    socket.once('data', data => {
                        callback({ data: data });
                    });
                    // No return value!!!
                },
                stub = { responses: [{ inject: fn.toString().replace("'$PORT'", originServerPort) }] };
            await api.createImposter(originServerRequest);
            await api.createImposter({ protocol: 'tcp', port, stubs: [stub] });

            const response = await tcp.send('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r', port);

            assert.strictEqual(response.toString().indexOf('HTTP/1.1'), 0);
        });

        it('should allow asynchronous injection', async function () {
            const originServerPort = port + 1,
                originServerStub = { responses: [{ is: { body: 'origin server' } }] },
                originServerRequest = {
                    protocol: 'http',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'origin'
                },
                fn = config => {
                    const net = require('net'),
                        options = {
                            host: '127.0.0.1',
                            port: '$PORT'
                        },
                        socket = net.connect(options, () => {
                            socket.write(`${config.request.data}\n`);
                        });
                    socket.once('data', data => {
                        config.callback({ data: data });
                    });
                    // No return value!!!
                },
                stub = { responses: [{ inject: fn.toString().replace("'$PORT'", originServerPort) }] };
            await api.createImposter(originServerRequest);
            await api.createImposter({ protocol: 'tcp', port, stubs: [stub] });

            const response = await tcp.send('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r', port);

            assert.strictEqual(response.toString().indexOf('HTTP/1.1'), 0);
        });

        it('should allow binary requests extending beyond a single packet using endOfRequestResolver', async function () {
            // We'll simulate a protocol that has a 4 byte message length at byte 0 indicating how many bytes follow
            const getRequest = length => {
                    const buffer = Buffer.alloc(length + 4);
                    buffer.writeUInt32LE(length, 0);

                    for (let i = 0; i < length; i += 1) {
                        buffer.writeInt8(0, i + 4);
                    }
                    return buffer;
                },
                largeRequest = getRequest(100000),
                responseBuffer = Buffer.from([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: responseBuffer.toString('base64') } }] },
                resolver = requestData => {
                    const messageLength = requestData.readUInt32LE(0);
                    return requestData.length === messageLength + 4;
                },
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'binary',
                    endOfRequestResolver: { inject: resolver.toString() }
                };
            await api.createImposter(request);

            await tcp.send(largeRequest, port);
            const response = await api.get(`/imposters/${port}`);

            assert.strictEqual(response.body.requests.length, 1);
            assert.strictEqual(response.body.requests[0].data, largeRequest.toString('base64'));
        });

        it('should allow text requests extending beyond a single packet using endOfRequestResolver', async function () {
            // We'll simulate HTTP
            // The last 'x' is added because new Array(5).join('x') creates 'xxxx' in JavaScript...
            const largeRequest = `Content-Length: 100000\n\n${new Array(100000).join('x')}x`,
                stub = { responses: [{ is: { data: 'success' } }] },
                resolver = requestData => {
                    const bodyLength = parseInt(/Content-Length: (\d+)/.exec(requestData)[1]),
                        body = /\n\n(.*)/.exec(requestData)[1];

                    return body.length === bodyLength;
                },
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'text',
                    endOfRequestResolver: { inject: resolver.toString() }
                };
            await api.createImposter(request);

            await tcp.send(largeRequest, port);
            const response = await api.get(`/imposters/${port}`);

            assert.strictEqual(response.body.requests.length, 1);
            assert.strictEqual(response.body.requests[0].data, largeRequest);
        });
    });
});
