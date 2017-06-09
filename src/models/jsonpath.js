'use strict';

/**
 * Shared logic for xpath selector
 * @module
 */

/**
 * Returns xpath value(s) from given xml
 * @param {String} selector - The xpath selector
 * @param {String} possibleJSON - the JSON string
 * @param {Logger} logger - Optional, used to log JSON parsing errors
 * @returns {Object}
 */
function select (selector, possibleJSON, logger) {
    var JSONPath = require('jsonpath-plus');

    try {
        var json = (typeof possibleJSON === 'object') ? possibleJSON : JSON.parse(possibleJSON),
            result = JSONPath.eval(json, selector);
        if (typeof result === 'string') {
            return result;
        }
        else if (result.length === 0) {
            return undefined;
        }
        else {
            return result;
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
