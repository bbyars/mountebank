'use strict';

function create (code) {
    return function (message, options) {
        var result = {
            code: code,
            message: message
        };

        if (options) {
            Object.keys(options).forEach(function (key) {
                result[key] = options[key];
            });
        }
        return result;
    };
}

module.exports = {
    ValidationError: create('bad data'),
    InjectionError: create('invalid operation'),
    ResourceConflictError: create('port in use'),
    InsufficientAccessError: create('insufficient access'),
    InvalidProxyError: create('invalid proxy'),
    MissingResourceError: create('no such imposter')
};
