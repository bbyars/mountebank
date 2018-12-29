'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    tcp = require('./tcpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000);

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with injections', function () {
        promiseIt('should allow javascript predicate for matching', function () {
            const fn = request => request.data.toString() === 'test',
                stub = {
                    predicates: [{ inject: fn.toString() }],
                    responses: [{ is: { data: 'MATCHED' } }]
                };

            return api.post('/imposters', { protocol: 'tcp', port, stubs: [stub] }).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('test', port);
            }).then(response => {
                assert.strictEqual(response.toString(), 'MATCHED');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow synchronous javascript injection for responses', function () {
            const fn = request => ({ data: `${request.data} INJECTED` }),
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };

            return api.post('/imposters', request).then(() => tcp.send('request', port)).then(response => {
                assert.strictEqual(response.toString(), 'request INJECTED');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow javascript injection to keep state between requests', function () {
            const fn = (request, state) => {
                    if (!state.calls) { state.calls = 0; }
                    state.calls += 1;
                    return { data: state.calls.toString() };
                },
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'tcp', port, stubs: [stub] };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return tcp.send('request', port);
            }).then(response => {
                assert.strictEqual(response.toString(), '1');

                return tcp.send('request', port);
            }).then(response => {
                assert.deepEqual(response.toString(), '2');
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow asynchronous injection', function () {
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
                            socket.end(`${request.data}\n`);
                        });
                    socket.once('data', data => {
                        callback({ data: data });
                    });
                    // No return value!!!
                },
                stub = { responses: [{ inject: fn.toString().replace("'$PORT'", originServerPort) }] };

            return api.post('/imposters', originServerRequest).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 4));
                return api.post('/imposters', { protocol: 'tcp', port, stubs: [stub] });
            }).then(response => {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                return tcp.send('GET / HTTP/1.1\r\nHost: www.google.com\r\n\r', port);
            }).then(response => {
                assert.strictEqual(response.toString().indexOf('HTTP/1.1'), 0);
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow binary requests extending beyond a single packet using endOfRequestResolver', function () {
            // We'll simulate a protocol that has a 4 byte message length at byte 0 indicating how many bytes follow
            const getRequest = length => {
                    const buffer = new Buffer(length + 4);
                    buffer.writeUInt32LE(length, 0);

                    for (let i = 0; i < length; i += 1) {
                        buffer.writeInt8(0, i + 4);
                    }
                    return buffer;
                },
                largeRequest = getRequest(100000),
                responseBuffer = new Buffer([0, 1, 2, 3]),
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

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send(largeRequest, port);
            }).then(() => api.get(`/imposters/${port}`)).then(response => {
                assert.strictEqual(response.body.requests.length, 1);
                assert.strictEqual(response.body.requests[0].data, largeRequest.toString('base64'));
            }).finally(() => api.del('/imposters'));
        });

        promiseIt('should allow text requests extending beyond a single packet using endOfRequestResolver', function () {
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

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);

                return tcp.send(largeRequest, port);
            }).then(() => api.get(`/imposters/${port}`)).then(response => {
                assert.strictEqual(response.body.requests.length, 1);
                assert.strictEqual(response.body.requests[0].data, largeRequest);
            }).finally(() => api.del('/imposters'));
        });
    });
});
