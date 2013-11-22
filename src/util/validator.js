'use strict';

function Validator () {
    var errors = [];

    function isArray (value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }

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
            return !isArray(value) || value.length === 0;
        });
    }

    function requireValidPredicate (spec) {
        addAllErrorsIf(spec, "bad data", "invalid predicate for '$NAME$'", function (value) {
            return value && typeof value !== 'object';
        });
    }

    return {
        requiredFields: requiredFields,
        requireProtocolSupport: requireProtocolSupport,
        requireValidPorts: requireValidPorts,
        requireNonEmptyArrays: requireNonEmptyArrays,
        requireValidPredicates: requireValidPredicate,
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
