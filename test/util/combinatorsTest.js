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
            assert.deepEqual(state, { key: 'value' });
        });
    });

    describe('#compose', function () {
        it('should compose functions', function () {
            var increment = function (i) { return i + 1; },
                double = function (j) { return j * 2; };
            assert.strictEqual(combinators.compose(increment, double)(2), 5);
        });

        it('should compose multiple functions', function () {
            var increment = function (i) { return i + 1; },
                double = function (j) { return j * 2; },
                triple = function (i) { return i * 3; };
            assert.strictEqual(combinators.compose(increment, double, triple)(1), 7);
        });
    });

    describe('#curry', function () {
        it('should pass curried parameter', function () {
            var fn = function (param) { return param; },
                curriedFn = combinators.curry(fn, 1);

            assert.strictEqual(curriedFn(), 1);
        });

        it('should curry multiple parameters', function () {
            var fn = function (param1, param2) { return param1 + param2; },
                curriedFn = combinators.curry(fn, 1, 2);

            assert.strictEqual(curriedFn(), 3);
        });

        it('should support partial currying', function () {
            var fn = function (param1, param2) { return param1 + param2; },
                curriedFn = combinators.curry(fn, 1);

            assert.strictEqual(curriedFn(2), 3);
        });
    });
});
