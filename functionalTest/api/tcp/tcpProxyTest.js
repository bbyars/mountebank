'use strict';

const assert = require('assert'),
    TcpProxy = require('../../../src/models/tcp/tcpProxy'),
    api = require('../api').create(),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    net = require('net'),
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp proxy', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    const noOp = () => {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };

    describe('#to', function () {
        it('should send same request information to proxied socket', async function () {
            const stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port, stubs: [stub] },
                proxy = TcpProxy.create(logger, 'utf8');
            await api.createImposter(request);

            const response = await proxy.to(`tcp://localhost:${port}`, { data: 'hello, world!' });

            assert.deepEqual(response.data.toString(), 'howdy!');
        });

        it('should proxy binary data', async function () {
            const buffer = Buffer.from([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'binary' },
                proxy = TcpProxy.create(logger, 'base64');
            await api.createImposter(request);

            const response = await proxy.to(`tcp://localhost:${port}`, { data: buffer });

            assert.deepEqual(Buffer.from(response.data, 'base64').toJSON().data, [0, 1, 2, 3]);
        });

        it('should obey endOfRequestResolver', async function () {
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
                request = { data: 'test' },
                response = await proxy.to(`tcp://localhost:${port}`, request);

            assert.strictEqual(response.data, largeRequest.toString('base64'), `Response length: ${response.data.length}`);
        });

        if (!airplaneMode) {
            it('should gracefully deal with DNS errors', async function () {
                const proxy = TcpProxy.create(logger, 'utf8');

                try {
                    await proxy.to('tcp://no.such.domain:80', { data: 'hello, world!' });
                    assert.fail('should not have resolved promise');
                }
                catch (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "tcp://no.such.domain:80"'
                    });
                }
            });
        }

        it('should gracefully deal with non listening ports', async function () {
            const proxy = TcpProxy.create(logger, 'utf8');

            try {
                await proxy.to('tcp://localhost:18000', { data: 'hello, world!' });
                assert.fail('should not have resolved promise');
            }
            catch (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to "tcp://localhost:18000"'
                });
            }
        });

        it('should reject non-tcp protocols', async function () {
            const proxy = TcpProxy.create(logger, 'utf8');

            try {
                await proxy.to('http://localhost:80', { data: 'hello, world!' });
                assert.fail('should not have resolved promise');
            }
            catch (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to proxy to any protocol other than tcp',
                    source: 'http://localhost:80'
                });
            }
        });
    });
});
