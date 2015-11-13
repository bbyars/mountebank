'use strict';

/**
 * Error types returned by the API
 * @module
 */

var inherit = require('./inherit'),
    helpers = require('./helpers');

function create (code) {
    return function (message, options) {
        var result = inherit.from(Error, {
            code: code,
            message: message
        });

        if (options) {
            Object.keys(options).forEach(function (key) {
                result[key] = options[key];
            });
        }
        return result;
    };
}

function createWithMessage (code, message) {
    return function (options) {
        var result = inherit.from(Error, {
            code: code,
            message: message
        });

        if (options) {
            Object.keys(options).forEach(function (key) {
                result[key] = options[key];
            });
        }
        return result;
    };
}

// Produces a JSON.stringify-able Error object
// (because message is on the prototype, it doesn't show by default)
function details (error) {
    var prototypeProperties = {};
    ['message', 'name', 'stack'].forEach(function (key) {
        if (error[key]) {
            prototypeProperties[key] = error[key];
        }
    });
    return helpers.merge(error, prototypeProperties);
}

module.exports = {
    ValidationError: create('bad data'),
    InjectionError: create('invalid injection'),
    ResourceConflictError: create('resource conflict'),
    InsufficientAccessError: createWithMessage('insufficient access', 'Run mb in superuser mode if you want access'),
    InvalidProxyError: create('invalid proxy'),
    MissingResourceError: create('no such resource'),
    InvalidJSONError: createWithMessage('invalid JSON', 'Unable to parse body as JSON'),
    details: details
};
