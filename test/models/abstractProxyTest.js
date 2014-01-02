'use strict';

var assert = require('assert'),
    Q = require('q'),
    events = require('events'),
    mock = require('../mock').mock,
    promiseIt = require('../testHelpers').promiseIt,
    AbstractProxy = require('../../src/models/abstractProxy'),
    util = require('util'),
    inherit = require('../../src/util/inherit');

describe('abstractProxy', function () {
    describe('#to', function () {

        var logger, implementation, proxiedRequest, proxy;

        beforeEach(function () {
            logger = {
                calls: { debug: [], info: [], warn: [], error: [] },
                debug: function () { this.calls.debug.push(util.format.apply(this, arguments)); },
                info: function () { this.calls.info.push(util.format.apply(this, arguments)); },
                warn: function () { this.calls.warn.push(util.format.apply(this, arguments)); },
                error: function () { this.calls.error.push(util.format.apply(this, arguments)); }
            };
            proxiedRequest = inherit.from(events.EventEmitter);
            implementation = {
                formatRequest: mock(),
                formatResponse: mock(),
                formatDestination: mock(),
                setupProxy: mock().returns(proxiedRequest),
                proxy: mock().returns(Q(true))
            };
            proxy = AbstractProxy.implement(logger, implementation);
        });

        promiseIt('should pass result of setupProxy to proxy', function () {
            return proxy.to('where', 'what').then(function () {
                assert.ok(implementation.proxy.wasCalledWith(proxiedRequest));
            });
        });

        promiseIt('should resolve with proxy promise', function () {
            implementation.proxy = mock().returns(Q('resolved'));

            return proxy.to('where', 'what').then(function (response) {
                assert.strictEqual(response, 'resolved');
            });
        });

        promiseIt('should log outgoing request', function () {
            implementation.formatRequest = mock().returns('request');
            implementation.formatDestination = mock().returns('destination');

            return proxy.to('destination', { requestFrom: 'from' }).then(function () {
                assert.ok(logger.calls.debug.indexOf('Proxy from => "request" => destination') >= 0);
            });
        });

        promiseIt('should log proxy response', function () {
            implementation.formatResponse = mock().returns('response');
            implementation.formatDestination = mock().returns('destination');

            return proxy.to('destination', { requestFrom: 'from' }).then(function () {
                assert.ok(logger.calls.debug.indexOf('Proxy from <= "response" <= destination') >= 0);
            });
        });

        promiseIt('should reject DNS resolution failures', function () {
            var promise = proxy.to('destination', 'what');

            proxiedRequest.emit('error', { code: 'ENOTFOUND'});

            return promise.then(function () {
                assert.fail('should have rejected');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Cannot resolve "destination"'
                });
            });
        });

        promiseIt('should reject connection failures', function () {
            var promise = proxy.to('destination', 'what');

            proxiedRequest.emit('error', { code: 'ECONNREFUSED'});

            return promise.then(function () {
                assert.fail('should have rejected');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to "destination"'
                });
            });
        });

        promiseIt('should reflect all other errors', function () {
            var promise = proxy.to('destination', 'what');

            proxiedRequest.emit('error', 'original error');

            return promise.then(function () {
                assert.fail('should have rejected');
            }, function (reason) {
                assert.strictEqual(reason, 'original error');
            });
        });
    });
});
