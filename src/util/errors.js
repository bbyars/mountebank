'use strict';

/**
 * Error types returned by the API
 * @module
 */

function createError (code, message, options) {
    const inherit = require('./inherit'),
        result = inherit.from(Error, { code, message });

    if (options) {
        Object.keys(options).forEach(key => {
            result[key] = options[key];
        });
    }
    return result;
}

function create (code) {
    return (message, options) => createError(code, message, options);
}

function createWithMessage (code, message) {
    return options => createError(code, message, options);
}

// Produces a JSON.stringify-able Error object
// (because message is on the prototype, it doesn't show by default)
function details (error) {
    const helpers = require('./helpers'),
        prototypeProperties = {};

    ['message', 'name', 'stack'].forEach(key => {
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
    CommunicationError: createWithMessage('communication', 'Error communicating with mountebank'),
    ProtocolError: create('cannot start server'),
    DatabaseError: create('corrupted database'),
    details
};
