'use strict';

var assert = require('assert'),
    Proxy = require('../../../src/models/tcp/tcpProxy'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000);

describe('tcp proxy', function () {
    this.timeout(timeout);

    var noOp = function () {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp },
        proxy = Proxy.create(logger, 'utf8');

    describe('#to', function () {
        promiseIt('should send same request information to proxied socket', function () {
            var stub = { responses: [{ is: { data: 'howdy!' } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function () {
                return proxy.to({ host: 'localhost', port: port }, { data: 'hello, world!' });
            }).then(function (response) {
                assert.deepEqual(response.data.toString(), 'howdy!');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should proxy binary data', function () {
            var buffer = new Buffer([0, 1, 2, 3]),
                stub = { responses: [{ is: { data: buffer.toString('base64') } }] },
                request = { protocol: 'tcp', port: port, stubs: [stub], mode: 'binary', name: this.name };

            return api.post('/imposters', request).then(function () {
                return proxy.to({ host: 'localhost', port: port }, { data: buffer });
            }).then(function (response) {
                assert.ok(Buffer.isBuffer(response.data));
                assert.deepEqual(response.data.toJSON(), [0, 1, 2, 3]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should gracefully deal with DNS errors', function () {
            return proxy.to({ host: 'no.such.domain', port: 80 }, { data: 'hello, world!' }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Cannot resolve {"host":"no.such.domain","port":80}'
                });
            });
        });

        promiseIt('should gracefully deal with non listening ports', function () {
            return proxy.to({ host: 'localhost', port: 18000 }, { data: 'hello, world!' }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to {"host":"localhost","port":18000}'
                });
            });
        });
    });
});
