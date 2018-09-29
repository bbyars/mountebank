'use strict';

const assert = require('assert'),
    combinators = require('../../src/util/combinators');

describe('combinators', () => {
    describe('#identity', () => {
        it('should return its argument', () => {
            assert.strictEqual('arg', combinators.identity('arg'));
        });
    });

    describe('#constant', () => {
        it('should return a function that always returns the same thing', () => {
            const K = combinators.constant('constant');
            assert.strictEqual('constant', K(0));
            assert.strictEqual('constant', K(1));
        });
    });

    describe('#noop', () => {
        it('does nothing', () => {
            const state = { key: 'value' };
            const result = combinators.noop.call(state);
            assert.strictEqual(result, undefined);
            assert.deepEqual(state, { key: 'value' });
        });
    });

    describe('#compose', () => {
        it('should compose functions', () => {
            const increment = function (i) { return i + 1; },
                double = function (j) { return j * 2; };
            assert.strictEqual(combinators.compose(increment, double)(2), 5);
        });

        it('should compose multiple functions', () => {
            const increment = function (i) { return i + 1; },
                double = function (j) { return j * 2; },
                triple = function (i) { return i * 3; };
            assert.strictEqual(combinators.compose(increment, double, triple)(1), 7);
        });

        it('should be identity if no functions passed in', () => {
            assert.strictEqual(combinators.compose()(5), 5);
        });
    });

    describe('#curry', () => {
        it('should pass curried parameter', () => {
            const fn = function (param) { return param; },
                curriedFn = combinators.curry(fn, 1);

            assert.strictEqual(curriedFn(), 1);
        });

        it('should curry multiple parameters', () => {
            const fn = function (param1, param2) { return param1 + param2; },
                curriedFn = combinators.curry(fn, 1, 2);

            assert.strictEqual(curriedFn(), 3);
        });

        it('should support partial currying', () => {
            const fn = function (param1, param2) { return param1 + param2; },
                curriedFn = combinators.curry(fn, 1);

            assert.strictEqual(curriedFn(2), 3);
        });
    });
});
