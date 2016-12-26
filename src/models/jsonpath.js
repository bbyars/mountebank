'use strict';

/**
 * Shared logic for xpath selector
 * @module
 */

var JSONPath = require('jsonpath-plus');

/**
 * Returns xpath value(s) from given xml
 * @param {String} selector - The xpath selector
 * @param {String} possibleJSON - the JSON string
 * @returns {Object}
 */
function select (selector, possibleJSON) {
    try {
        var result = JSONPath.eval(JSON.parse(possibleJSON), selector);
        if (typeof result === 'string') {
            return result;
        }
        else if (result.length === 0) {
            return undefined;
        }
        else {
            return result.sort();
        }
    }
    catch (e) {
        return undefined;
    }
}

module.exports = {
    select: select
};
