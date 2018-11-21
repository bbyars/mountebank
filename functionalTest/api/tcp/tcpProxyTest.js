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

describe('tcp proxy', () => {
    const noOp = () => {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };

    describe('#to', () => {
        promiseIt('should send same request information to proxied socket', () => {
            const stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port, stubs: [stub] },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(() => proxy.to(`tcp://localhost:${port}`, { data: 'hello, world!' })).then(response => {
                assert.deepEqual(response.data.toString(), 'howdy!');
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);

        promiseIt('should support old proxy syntax for backwards compatibility', () => {
            const stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port, stubs: [stub] },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(() => proxy.to({ host: 'localhost', port }, { data: 'hello, world!' })).then(response => {
                assert.deepEqual(response.data.toString(), 'howdy!');
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);

        promiseIt('should proxy binary data', () => {
            const buffer = new Buffer([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'binary' },
                proxy = TcpProxy.create(logger, 'base64');

            return api.post('/imposters', request).then(() => proxy.to(`tcp://localhost:${port}`, { data: buffer })).then(response => {
                assert.deepEqual(new Buffer(response.data, 'base64').toJSON().data, [0, 1, 2, 3]);
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);

        promiseIt('should wait for remote socket to end before returning', () => {
            const server = net.createServer(client => {
                client.on('data', () => {
                    // force multiple data packets
                    client.write((new Array(10 * 1024 * 1024)).join('x'));
                });
            });
            server.listen(port);

            const proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to(`tcp://localhost:${port}`, { data: 'hello, world!' }).then(response => {
                assert.strictEqual(response.data.length, 10 * 1024 * 1024 - 1);
            }).finally(() => {
                server.close();
            });
        }).timeout(timeout);

        promiseIt('should capture response time to origin server', () => {
            const stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port, stubs: [stub] },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(() => proxy.to(`tcp://localhost:${port}`, { data: 'hello, world!' })).then(response => {
                assert.deepEqual(response.data.toString(), 'howdy!');
                assert.ok(response._proxyResponseTime >= 0); // eslint-disable-line no-underscore-dangle
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);

        if (!airplaneMode) {
            promiseIt('should gracefully deal with DNS errors', () => {
                const proxy = TcpProxy.create(logger, 'utf8');

                return proxy.to('tcp://no.such.domain:80', { data: 'hello, world!' }).then(() => {
                    assert.fail('should not have resolved promise');
                }, reason => {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "tcp://no.such.domain:80"'
                    });
                });
            }).timeout(timeout);
        }

        promiseIt('should gracefully deal with non listening ports', () => {
            const proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('tcp://localhost:18000', { data: 'hello, world!' }).then(() => {
                assert.fail('should not have resolved promise');
            }, reason => {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to "tcp://localhost:18000"'
                });
            });
        }).timeout(timeout);

        promiseIt('should reject non-tcp protocols', () => {
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
        }).timeout(timeout);
    });
});
