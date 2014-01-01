'use strict';

var assert = require('assert'),
    combinators = require('../../src/util/combinators');

describe('combinators', function () {
    describe('#identity', function () {
        it('should return its argument', function () {
            assert.strictEqual('arg', combinators.identity('arg'));
        });
    });

    describe('#constant', function () {
        it('should return a function that always returns the same thing', function () {
            var K = combinators.constant('constant');
            assert.strictEqual('constant', K(0));
            assert.strictEqual('constant', K(1));
        });
    });

    describe('#noop', function () {
        it('does nothing', function () {
            var state = { key: 'value' };
            var result = combinators.noop.call(state);
            assert.strictEqual(result, undefined);
            assert.deepEqual(state, { key: 'value'});
        });
    });

    describe('#clone', function () {
        it('should return a deep copy', function () {
            var original = {
                    level: 1,
                    key: {
                        level: 2,
                        key: 'value'
                    }
                };

            var clone = combinators.clone(original);
            assert.ok(clone !== original);
            assert.deepEqual(clone, original);
        });
    });

    describe('#merge', function () {
        it('should deep merge two object', function () {
            var first = {
                    first: 1,
                    second: { third: 3 }
                },
                second = {
                    fourth: 4,
                    fifth: { sixth: 6 }
                };

            var merged = combinators.merge(first, second);

            assert.deepEqual(merged, {
                first: 1,
                fourth: 4,
                second: { third: 3 },
                fifth: { sixth: 6 }
            });
        });

        it('should use second parameter for conflict resolution', function () {
            var defaults = { onlyInDefault: 1, inBoth: 1 },
                overrides = { onlyInOverrides: 2, inBoth: 2};

            var merged = combinators.merge(defaults, overrides);

            assert.deepEqual(merged, {
                onlyInDefault: 1,
                onlyInOverrides: 2,
                inBoth: 2
            });
        });

        it('should not change state of either parameter', function () {
            var first = { one: 1 },
                second = { two: 2 };

            combinators.merge(first, second);

            assert.deepEqual(first, { one: 1 });
            assert.deepEqual(second, { two: 2 });
        });
    });
});
