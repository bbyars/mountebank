'use strict';

/**
 * Utility module to to get and set headers in a case-insensitive way while maintaining
 * the original case sent in the request
 * @module
 */

/**
 * Creates a map from the given headers
 * @param {Object} headers - the starting headers
 * @returns {Object} - the map
 */

const helpers = require('../../util/helpers.js');

function of (headers) {
    /**
     * Returns whether the map contains the given headerName, regardless of case
     * @param {String} headerName - the header name
     * @returns {boolean}
     */
    function has (headerName) {
        return Object.keys(headers).some(header => header.toLowerCase() === headerName.toLowerCase());
    }

    function headerNameFor (headerName) {
        const result = Object.keys(headers).find(header => header.toLowerCase() === headerName.toLowerCase());

        return helpers.defined(result) ? result : headerName;
    }

    /**
     * Retrieves the value for the given header in a case-insensitive way
     * @param {String} headerName - the header name
     * @returns {*}
     */
    function get (headerName) {
        return headers[headerNameFor(headerName)];
    }

    /**
     * Sets the value for the given header in a case-insensitive way.
     * Will add the key if it does not already exist
     * @param {String} headerName - the header name
     * @param {String} value - the value
     */
    function set (headerName, value) {
        headers[headerNameFor(headerName)] = value;
    }

    /**
     * Retrieves all the headers with the original case for the keys
     * @returns {Object} - the key/value pairs
     */
    function all () {
        return headers;
    }

    return { get, set, has, all };
}

function add (current, value) {
    return Array.isArray(current) ? current.concat(value) : [current].concat(value);
}

function arrayifyIfExists (current, value) {
    return current ? add(current, value) : value;
}

/**
 * Converts the array of raw headers to a map, maintaining the original case of the keys.
 * This is necessary since node downcases the headers in its request.headers
 * @param {Object} rawHeaders - the array of alternating keys and values
 * @returns {Object} - the map
 */
function ofRaw (rawHeaders) {
    const result = {};
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i];
        const value = rawHeaders[i + 1];
        result[name] = arrayifyIfExists(result[name], value);
    }
    return of(result);
}

module.exports = { ofRaw, of };
