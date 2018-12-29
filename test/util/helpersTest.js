'use strict';

const assert = require('assert'),
    helpers = require('../../src/util/helpers');

describe('helpers', function () {
    describe('#socketName', function () {
        it('should concatenate host and port for a normal socket', function () {
            const name = helpers.socketName({ remoteAddress: 'address', remotePort: 'port' });
            assert.strictEqual(name, 'address:port');
        });

        it('should just use host if port is undefined', function () {
            const name = helpers.socketName({ remoteAddress: 'address' });
            assert.strictEqual(name, 'address');
        });
    });

    describe('#clone', function () {
        it('should return a deep copy', function () {
            const original = {
                level: 1,
                key: {
                    level: 2,
                    key: 'value'
                }
            };

            const clone = helpers.clone(original);
            assert.ok(clone !== original);
            assert.deepEqual(clone, original);
        });
    });

    describe('#merge', function () {
        it('should deep merge two object', function () {
            const first = {
                    first: 1,
                    second: { third: 3 }
                },
                second = {
                    fourth: 4,
                    fifth: { sixth: 6 }
                };

            const merged = helpers.merge(first, second);

            assert.deepEqual(merged, {
                first: 1,
                fourth: 4,
                second: { third: 3 },
                fifth: { sixth: 6 }
            });
        });

        it('should use second parameter for conflict resolution', function () {
            const defaults = { onlyInDefault: 1, inBoth: 1 },
                overrides = { onlyInOverrides: 2, inBoth: 2 };

            const merged = helpers.merge(defaults, overrides);

            assert.deepEqual(merged, {
                onlyInDefault: 1,
                onlyInOverrides: 2,
                inBoth: 2
            });
        });

        it('should not change state of either parameter', function () {
            const first = { one: 1 },
                second = { two: 2 };

            helpers.merge(first, second);

            assert.deepEqual(first, { one: 1 });
            assert.deepEqual(second, { two: 2 });
        });

        it('should be able to handle null values', function () {
            const defaults = { onlyInDefault: 1, inBoth: 1 },
                overrides = { onlyInOverrides: 2, inBoth: null };

            const merged = helpers.merge(defaults, overrides);

            assert.deepEqual(merged, {
                onlyInDefault: 1,
                onlyInOverrides: 2,
                inBoth: null
            });
        });
    });
});
