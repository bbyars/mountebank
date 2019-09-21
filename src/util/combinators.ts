'use strict';

/**
 * Helpful combinators
 * For the non-pedants, a combinator is basically just a function with no free variables.
 * For the non-pedants, "no free variables" means that the combinator does not have dependencies
 * on things outside the function (e.g. it only depends on the function parameters).
 * A strict definition of combinators requires functions as input parameters, but I loosen that here.
 * That definition really only serves mathematical modeling of state in pure functional terms
 * @module
 */

/**
 * Curries a function parameters, which is to say that it returns a function with reduced arity.
 * @example
 * function sum (x, y) { return x + y; }
 * curry(sum, 1)(2); // returns 3
 * curry(sum, 1, 2)(); // returns 3
 * @param {Function} fn - The function to curry
 * @param {...*} args - The arguments to curry
 * @returns {Function}
 */
export function curry (fn:Function, ...args:unknown[]):Function {
    return function (...carry_args:unknown[]) {
        const allArgs = args.concat(carry_args);

        return fn.apply(null, allArgs);
    };
}

/**
 * Composes two or more functions
 * @example
 * function increment (i) { return i + 1; }
 * function double (i) { return i * 2; }
 * function triple (i) { return i * 3; }
 * combinators.compose(increment, double, triple)(1); // returns 7
 * @param {...Function} args - The functions to compose
 * @returns {Function} A single function that represents the composition of the functions provided
 */
export function compose ():Function {
    const args = Array.prototype.slice.call(arguments).reverse();
    return (obj:object) => args.reduce((result:unknown, F:(obj:unknown) => unknown) => F(result), obj);
}

/**
 * A function that does nothing, occasionally useful to avoid special case logic
 */
export function noop():void {}

/**
 * Ignores its parameters, and instead always returns a constant value
 * @param {Object} k - The constant to return
 * @returns {Function} - A function that will always return the constant
 */
export function constant<T>(k:T): () => T {
  return () => k
}

/**
 * Returns what was passed in unchanged, occasionally useful as the default transformation function
 * to avoid special case logic
 * @param {Object} i - The input
 * @returns {Object} Exactly what was passed in
 */
export function identity<T>(i:T):T {
    return i
}
