'use strict';

function Validator () {
    var errors = [];

    function requiredFields (fields) {
        Object.keys(fields).forEach(function (name) {
            if (!fields[name]) {
                errors.push({
                    code: "missing field",
                    message: "'" + name + "' is a required field"
                });
            }
        });
    }

    function requireProtocolSupport (spec) {
        Object.keys(spec).forEach(function (name) {
            if (name !== 'undefined' && !spec[name]) {
                errors.push({
                    code: "unsupported protocol",
                    message: "the " + name + " protocol is not yet supported"
                });
            }
        });
    }

    function requireValidPort (port) {
        var isValid = (port === undefined) ||
                      (port.toString().indexOf('.') === -1 && port > 0 && port < 65536);

        if (!isValid) {
            errors.push({
                code: "bad data",
                message: "invalid value for 'port'"
            });
        }
    }

    function isArray (value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }

    function requireNonEmptyArrays (spec) {
        Object.keys(spec).forEach(function (name) {
            if (!isArray(spec[name]) || spec[name].length === 0) {
                errors.push({
                    code: "bad data",
                    message: "'" + name + "' must be a non-empty array"
                });
            }
        });
    }

    return {
        requiredFields: requiredFields,
        requireProtocolSupport: requireProtocolSupport,
        requireValidPort: requireValidPort,
        requireNonEmptyArrays: requireNonEmptyArrays,
        errors: errors
    };
}

function create (options) {

    function errors () {
        var validator = Validator();
        Object.keys(options).forEach(function (validation) {
            validator[validation](options[validation]);
        });
        return validator.errors;
    }

    function isValid () {
        return errors().length === 0;
    }

    return {
        isValid: isValid,
        errors: errors
    };
}

module.exports = {
    create: create
};
