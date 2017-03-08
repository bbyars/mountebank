'use strict';

var assert = require('assert'),
    TcpProxy = require('../../../src/models/tcp/tcpProxy'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    net = require('net'),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('tcp proxy', function () {
    if (isWindows) {
        // the DNS resolver errors take a lot longer on Windows
        this.timeout(10000);
    }
    else {
        this.timeout(timeout);
    }

    var noOp = function () {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp };

    describe('#to', function () {
        promiseIt('should send same request information to proxied socket', function () {
            var stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(function () {
                return proxy.to('tcp://localhost:' + port, { data: 'hello, world!' });
            }).then(function (response) {
                assert.deepEqual(response.data.toString(), 'howdy!');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should support old proxy syntax for backwards compatibility', function () {
            var stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(function () {
                return proxy.to({ host: 'localhost', port: port }, { data: 'hello, world!' });
            }).then(function (response) {
                assert.deepEqual(response.data.toString(), 'howdy!');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should proxy binary data', function () {
            var buffer = new Buffer([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], mode: 'binary', name: this.name },
                proxy = TcpProxy.create(logger, 'base64');

            return api.post('/imposters', request).then(function () {
                return proxy.to('tcp://localhost:' + port, { data: buffer });
            }).then(function (response) {
                assert.deepEqual(new Buffer(response.data, 'base64').toJSON().data, [0, 1, 2, 3]);
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should wait for remote socket to end before returning', function () {
            var server = net.createServer(function (client) {
                client.on('data', function () {
                    // force multiple data packets
                    client.write((new Array(10 * 1024 * 1024)).join('x'));
                });
            });
            server.listen(port);

            var proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('tcp://localhost:' + port, { data: 'hello, world!' }).then(function (response) {
                assert.strictEqual(response.data.length, 10 * 1024 * 1024 - 1);
            }).finally(function () {
                server.close();
            });
        });

        promiseIt('should capture response time to origin server', function () {
            var stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name },
                proxy = TcpProxy.create(logger, 'utf8');

            return api.post('/imposters', request).then(function () {
                return proxy.to('tcp://localhost:' + port, { data: 'hello, world!' });
            }).then(function (response) {
                assert.deepEqual(response.data.toString(), 'howdy!');
                assert.ok(response._proxyResponseTime >= 0); // eslint-disable-line no-underscore-dangle
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        if (!airplaneMode) {
            promiseIt('should gracefully deal with DNS errors', function () {
                var proxy = TcpProxy.create(logger, 'utf8');

                return proxy.to('tcp://no.such.domain:80', { data: 'hello, world!' }).then(function () {
                    assert.fail('should not have resolved promise');
                }, function (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "tcp://no.such.domain:80"'
                    });
                });
            });
        }

        promiseIt('should gracefully deal with non listening ports', function () {
            var proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('tcp://localhost:18000', { data: 'hello, world!' }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to "tcp://localhost:18000"'
                });
            });
        });

        promiseIt('should reject non-tcp protocols', function () {
            var proxy = TcpProxy.create(logger, 'utf8');

            return proxy.to('http://localhost:80', { data: 'hello, world!' }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to proxy to any protocol other than tcp',
                    source: 'http://localhost:80'
                });
            });
        });
    });
});
