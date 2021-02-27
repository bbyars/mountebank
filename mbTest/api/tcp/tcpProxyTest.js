'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    tcp = require('./tcpClient'),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp proxy', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    it('should send same request information to proxied socket', async function () {
        const origin = {
                protocol: 'tcp',
                port,
                stubs: [{ responses: [{ is: { data: 'howdy!' } }] }]
            },
            proxy = {
                protocol: 'tcp',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `tcp://localhost:${origin.port}` } }] }]
            };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await tcp.send('hello, world!', proxy.port);

        assert.deepEqual(response.toString(), 'howdy!');
    });

    it('should proxy binary data', async function () {
        const buffer = Buffer.from([0, 1, 2, 3]),
            origin = {
                protocol: 'tcp',
                port,
                stubs: [{ responses: [{ is: { data: buffer.toString('base64') } }] }],
                mode: 'binary'
            },
            proxy = {
                protocol: 'tcp',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `tcp://localhost:${origin.port}` } }] }],
                mode: 'binary'
            };
        await api.createImposter(origin);
        await api.createImposter(proxy);

        const response = await tcp.send('test', proxy.port);

        assert.ok(Buffer.isBuffer(response));
        assert.deepEqual(response.toJSON().data, [0, 1, 2, 3]);
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
            origin = {
                protocol: 'tcp',
                mode: 'binary',
                port,
                stubs: [{ responses: [{ is: { data: largeRequest.toString('base64') } }] }]
            },
            proxy = {
                protocol: 'tcp',
                mode: 'binary',
                port: port + 1,
                stubs: [{ responses: [{ proxy: { to: `tcp://localhost:${origin.port}` } }] }],
                endOfRequestResolver: { inject: resolver.toString() },
                recordRequests: true
            };
        await api.createImposter(proxy);
        await api.createImposter(origin);

        const response = await tcp.send(getRequest(4), proxy.port, 0, undefined, largeRequest.length);

        assert.strictEqual(response.length, largeRequest.length, `Response length: ${response.length}`);
    });

    if (!airplaneMode) {
        it('should gracefully deal with DNS errors', async function () {
            const proxy = {
                protocol: 'tcp',
                port,
                stubs: [{ responses: [{ proxy: { to: 'tcp://no.such.domain:80' } }] }]
            };
            await api.createImposter(proxy);

            const response = await tcp.send('0', proxy.port),
                message = JSON.parse(response.toString('utf8'));

            assert.strictEqual(message.errors[0].code, 'invalid proxy');
            assert.strictEqual(message.errors[0].message, 'Cannot resolve "tcp://no.such.domain:80"');
        });
    }

    it('should gracefully deal with non listening ports', async function () {
        const proxy = {
            protocol: 'tcp',
            port,
            stubs: [{ responses: [{ proxy: { to: 'tcp://localhost:18000' } }] }]
        };
        await api.createImposter(proxy);

        const response = await tcp.send('hello, world!', proxy.port),
            message = JSON.parse(response.toString('utf8'));

        assert.strictEqual(message.errors[0].code, 'invalid proxy');
        assert.strictEqual(message.errors[0].message, 'Unable to connect to "tcp://localhost:18000"');
    });

    it('should reject non-tcp protocols', async function () {
        const proxy = {
            protocol: 'tcp',
            port,
            stubs: [{ responses: [{ proxy: { to: 'http://localhost:80' } }] }]
        };

        await api.createImposter(proxy);

        const response = await tcp.send('hello, world!', proxy.port),
            message = JSON.parse(response.toString('utf8'));

        assert.strictEqual(message.errors[0].code, 'invalid proxy');
        assert.strictEqual(message.errors[0].message, 'Unable to proxy to any protocol other than tcp');
        assert.strictEqual(message.errors[0].source, 'http://localhost:80');
    });
});
