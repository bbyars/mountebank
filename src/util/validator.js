'use strict';

var utils = require('util'),
    Q = require('q'),
    exceptions = require('./errors');

function createDefaultValidator () {
    var errors = [];

    function addAllErrorsIf (spec, message, predicate) {
        Object.keys(spec).forEach(function (name) {
            if (predicate(spec[name], name)) {
                errors.push(exceptions.ValidationError(message.replace('$NAME$', name)));
            }
        });
    }

    function requiredFields (spec) {
        addAllErrorsIf(spec, "'$NAME$' is a required field", function (value) {
            return typeof value === 'undefined';
        });
    }

    function requireProtocolSupport (spec) {
        addAllErrorsIf(spec, "the $NAME$ protocol is not yet supported", function (value, name) {
            return name !== 'undefined' && !value;
        });
    }

    function requireValidPorts (spec) {
        addAllErrorsIf(spec, "invalid value for '$NAME$'", function (value) {
            var isValid = (value === undefined) ||
                (value.toString().indexOf('.') === -1 && value > 0 && value < 65536);
            return !isValid;
        });
    }

    function requireNonEmptyArrays (spec) {
        addAllErrorsIf(spec, "'$NAME$' must be a non-empty array", function (value) {
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
