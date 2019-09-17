'use strict';

interface IIndexed {
    [key: string]:any
}

/** @module */

/**
 * Returns true if obj is a defined value
 * @param {Object} obj - the value to test
 * @returns {boolean}
 */
export function defined (obj:Object):Boolean {
    return typeof obj !== 'undefined';
}

/**
 * Returns true if obj is a non-null object
 * Checking for typeof 'object' without checking for nulls
 * is a very common source of bugs
 * @param {Object} obj - the value to test
 * @returns {boolean}
 */
export function isObject (obj:Object|null):boolean {
    return typeof obj === 'object' && obj !== null;
}

interface ISocket {
    remoteAddress:string;
    remotePort:string;
}
/**
 * Returns the text used for logging purposes related to this socket
 * @param {Object} socket - the socket
 * @returns {string}
 */
export function socketName (socket:ISocket):string {
    let result = socket.remoteAddress;
    if (socket.remotePort) {
        result += `:${socket.remotePort}`;
    }
    return result;
}

/**
 * Returns a deep clone of obj
 * @param {Object} obj - the object to clone
 * @returns {Object}
 */
export function clone (obj:Object):Object {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Returns a new object combining the two parameters
 * @param {Object} defaults - The base object
 * @param {Object} overrides - The object to merge from.  Where the same property exists in both defaults
 * and overrides, the values for overrides will be used
 * @returns {Object}
 */
export function merge (defaults:Object & IIndexed, overrides:Object & IIndexed):Object {
    const result:Object & IIndexed = clone(defaults);
    Object.keys(overrides).forEach(key => {
        if (typeof overrides[key] === 'object' && overrides[key] !== null) {
            result[key] = merge(result[key] || {}, overrides[key]);
        }
        else {
            result[key] = overrides[key];
        }
    });
    return result;
}

/**
 * Sets a value of nested key string descriptor inside a Object.
 * It changes the passed object.
 * Ex:
 *    let obj = {a: {b:{c:'initial'}}}
 *    setNestedKey(obj, ['a', 'b', 'c'], 'changed-value')
 *    assert(obj === {a: {b:{c:'changed-value'}}})
 *
 * @param {Object} obj   Object to set the nested key
 * @param {Array} path  An array to describe the path(Ex: ['a', 'b', 'c'])
 * @param {Object} value Any value
 * @returns {undefined}
 * from https://stackoverflow.com/a/49754647
 */
export function setDeep (obj:Object & IIndexed, path:string[], value:Object):void {
    if (path.length === 1) {
        obj[path[0]] = value;
        return;
    }
    setDeep(obj[path[0]], path.slice(1), value);
}
