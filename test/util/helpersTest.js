'use strict';

var assert = require('assert'),
    helpers = require('../../src/util/helpers');

describe('helpers', function () {
    describe('#socketName', function () {
        it('should concatenate host and port for a normal socket', function () {
            var name = helpers.socketName({ remoteAddress: 'address', remotePort: 'port' });
            assert.strictEqual(name, 'address:port');
        });

        it('should just use host if port is undefined', function () {
            var name = helpers.socketName({ remoteAddress: 'address' });
            assert.strictEqual(name, 'address');
        });
    });
});
