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
 * Returns the text used for logging purposes related to this socket
 * @param {Object} socket - the socket
 * @returns {string}
 */
function socketName (socket) {
    var result = socket.remoteAddress;
    if (socket.remotePort) {
        result += ':' + socket.remotePort;
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
    var result = clone(defaults);
    Object.keys(overrides).forEach(function (key) {
        if (typeof overrides[key] === 'object' && overrides[key] !== null) {
            result[key] = merge(result[key] || {}, overrides[key]);
        }
        else {
            result[key] = overrides[key];
        }
    });
    return result;
}

module.exports = {
    defined: defined,
    socketName: socketName,
    clone: clone,
    merge: merge
};
