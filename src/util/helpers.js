'use strict';

/** @module */

/**
 * Returns true if obj is a defined value
 * @param {Object} obj - the value to test
 * @returns {boolean}
 */
function defined (obj) {
    return typeof obj !== 'undefined';
}

/**
 * Returns true if obj is a non-null object
 * Checking for typeof 'object' without checking for nulls
 * is a very common source of bugs
 * @param {Object} obj - the value to test
 * @returns {boolean}
 */
function isObject (obj) {
    return typeof obj === 'object' && obj !== null;
}

/**
 * Returns the text used for logging purposes related to this socket
 * @param {Object} socket - the socket
 * @returns {string}
 */
function socketName (socket) {
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
function clone (obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Returns a new object combining the two parameters
 * @param {Object} defaults - The base object
 * @param {Object} overrides - The object to merge from.  Where the same property exists in both defaults
 * and overrides, the values for overrides will be used
 * @returns {Object}
 */
function merge (defaults, overrides) {
    const result = clone(defaults);
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
function setDeep (obj, path, value) {
    if (path.length === 1) {
        obj[path] = value;
        return;
    }
    setDeep(obj[path[0]], path.slice(1), value);
}

function simulateFault (socket, faultConfig, logger) {
    if (typeof faultConfig === 'undefined') {
        return false;
    }
    if (faultConfig === 'CONNECTION_RESET_BY_PEER') {
        logger.debug('Closing the connection');
        socket.destroy();
        return true;
    }
    else if (faultConfig === 'RANDOM_DATA_THEN_CLOSE') {
        logger.debug('Sending garbage data then closing the connection');
        socket.write(Buffer.from('Htijy%@tWXJ/hQ#[Q:7G@dH4"gu[QaX&', 'utf-8'));
        socket.destroy();
        return true;
    }
    else {
        logger.error('Unexpected fault type [' + faultConfig + '], expected either CONNECTION_RESET_BY_PEER or RANDOM_DATA_THEN_CLOSE');
        return false;
    }
}

/**
 * Remove specific key and value from object
 * @param {Object} obj Object to filter
 * @param {Array|Object|String} filter keys to remove
 * @returns {Object}
 */

function objFilter (obj, filter) {

    if (typeof filter === 'string') {
        delete obj[filter];
    }
    else if (Array.isArray(filter)) {
        filter.filter(keyFilter => obj[keyFilter]).forEach(keyFilter => objFilter(obj, keyFilter));
    }
    else {
        Object.keys(filter).filter(keyFilter => obj[keyFilter]).forEach(keyFilter => objFilter(obj[keyFilter], filter[keyFilter]));
    }
    return obj;
}

module.exports = { defined, isObject, socketName, clone, merge, setDeep, simulateFault, objFilter };
