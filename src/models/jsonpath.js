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
 * @param {Logger} logger - Optional, used to log JSON parsing errors
 * @returns {Object}
 */
function select (selector, possibleJSON, logger) {
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
        if (logger) {
            logger.warn('Cannot parse as JSON: ' + JSON.stringify(possibleJSON));
        }
        return undefined;
    }
}

module.exports = {
    select: select
};
