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

function createWithMessage (code, message) {
    return function (options) {
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
    InjectionError: createWithMessage('invalid operation', 'inject is not allowed unless mb is run with the --allowInjection flag'),
    ResourceConflictError: create('resource conflict'),
    InsufficientAccessError: createWithMessage('insufficient access', 'Run mb in superuser mode if you want access'),
    InvalidProxyError: create('invalid proxy'),
    MissingResourceError: create('no such resource')
};
