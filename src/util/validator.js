'use strict';

var utils = require('util'),
    Q = require('q');

function createDefaultValidator () {
    var errors = [];

    function addAllErrorsIf (spec, code, message, predicate) {
        Object.keys(spec).forEach(function (name) {
            if (predicate(spec[name], name)) {
                errors.push({
                    code: code,
                    message: message.replace('$NAME$', name)
                });
            }
        });
    }

    function requiredFields (spec) {
        addAllErrorsIf(spec, "missing field", "'$NAME$' is a required field", function (value) {
            return !value;
        });
    }

    function requireProtocolSupport (spec) {
        addAllErrorsIf(spec, "unsupported protocol", "the $NAME$ protocol is not yet supported", function (value, name) {
            return name !== 'undefined' && !value;
        });
    }

    function requireValidPorts (spec) {
        addAllErrorsIf(spec, "bad data", "invalid value for '$NAME$'", function (value) {
            var isValid = (value === undefined) ||
                (value.toString().indexOf('.') === -1 && value > 0 && value < 65536);
            return !isValid;
        });
    }

    function requireNonEmptyArrays (spec) {
        addAllErrorsIf(spec, "bad data", "'$NAME$' must be a non-empty array", function (value) {
            return !utils.isArray(value) || value.length === 0;
        });
    }

    return {
        requiredFields: requiredFields,
        requireProtocolSupport: requireProtocolSupport,
        requireValidPorts: requireValidPorts,
        requireNonEmptyArrays: requireNonEmptyArrays,
        errors: errors
    };
}

function create (options) {

    function errors () {
        var validator = createDefaultValidator();
        Object.keys(options).forEach(function (validation) {
            validator[validation](options[validation]);
        });
        return validator.errors;
    }

    function isValid () {
        return errors().length === 0;
    }

    // Matches the Protocol validator spec
    function validate () {
        return Q({
            isValid: isValid(),
            errors: errors()
        });
    }

    return {
        isValid: isValid,
        errors: errors,
        validate: validate
    };
}

module.exports = {
    create: create
};
