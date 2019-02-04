'use strict';

const assert = require('assert'),
    TcpProxy = require('../../../src/models/tcp/tcpProxy'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    net = require('net'),
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp proxy', function () {
    this.timeout(timeout);

    const noOp = () => {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };

    describe('#to', function () {
        promiseIt('should send same request information to proxied socket', function () {
            const stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port, stubs: [stub] },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request)
                .then(() => proxy.to(`tcp://localhost:${port}`, { data: 'hello, world!' }))
                .then(response => {
                    assert.deepEqual(response.data.toString(), 'howdy!');
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should proxy binary data', function () {
            const buffer = Buffer.from([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'binary' },
                proxy = TcpProxy.create(logger, 'base64');

            return api.post('/imposters', request)
                .then(() => proxy.to(`tcp://localhost:${port}`, { data: buffer }))
                .then(response => {
                    assert.deepEqual(Buffer.from(response.data, 'base64').toJSON().data, [0, 1, 2, 3]);
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should obey endOfRequestResolver', function () {
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
                resolver = requestBuffer => {
                    const messageLength = requestBuffer.readUInt32LE(0);
                    return requestBuffer.length >= messageLength + 4;
                },
                originServer = net.createServer(client => {
                    client.on('data', () => {
                        // force multiple data packets
                        client.write(largeRequest, () => { originServer.close(); });
                    });
                });

            originServer.listen(port);

            const proxy = TcpProxy.create(logger, 'base64', resolver),
                request = { data: 'test' };
            return proxy.to(`tcp://localhost:${port}`, request).then(response => {
                assert.strictEqual(response.data, largeRequest.toString('base64'), `Response length: ${response.data.length}`);
            });
        });

        if (!airplaneMode) {
            promiseIt('should gracefully deal with DNS errors', function () {
                const proxy = TcpProxy.create(logger, 'utf8');

                return proxy.to('tcp://no.such.domain:80', { data: 'hello, world!' }).then(() => {
                    assert.fail('should not have resolved promise');
                }, reason => {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "tcp://no.such.domain:80"'
                    });
                });
            });
        }

        promiseIt('should gracefully deal with non listening ports', function () {
            const proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('tcp://localhost:18000', { data: 'hello, world!' }).then(() => {
                assert.fail('should not have resolved promise');
            }, reason => {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to "tcp://localhost:18000"'
                });
            });
        });

        promiseIt('should reject non-tcp protocols', function () {
            const proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('http://localhost:80', { data: 'hello, world!' }).then(() => {
                assert.fail('should not have resolved promise');
            }, reason => {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to proxy to any protocol other than tcp',
                    source: 'http://localhost:80'
                });
            });
        });
    });
});
