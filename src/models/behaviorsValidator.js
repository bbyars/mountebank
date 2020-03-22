'use strict';

/**
 * The module that does validation of behavior configuration
 * @module
 */

/**
 * Creates the validator
 * @returns {{validate: validate}}
 */
function create () {
    const exceptions = require('../util/errors');

    function hasExactlyOneKey (obj) {
        const keys = Object.keys(obj);
        return keys.length === 1;
    }

    function navigate (config, path) {
        if (path === '') {
            return config;
        }
        else {
            return path.split('.').reduce(function (field, fieldName) {
                return field[fieldName];
            }, config);
        }
    }

    function typeErrorMessageFor (allowedTypes, additionalContext) {
        const util = require('util'),
            spellings = { number: 'a', object: 'an', string: 'a' };
        let message = util.format('must be %s %s', spellings[allowedTypes[0]], allowedTypes[0]);

        for (let i = 1; i < allowedTypes.length; i += 1) {
            message += util.format(' or %s %s', spellings[allowedTypes[i]], allowedTypes[i]);
        }
        if (additionalContext) {
            message += ', representing ' + additionalContext;
        }
        return message;
    }

    function pathFor (pathPrefix, fieldName) {
        if (pathPrefix === '') {
            return fieldName;
        }
        else {
            return pathPrefix + '.' + fieldName;
        }
    }

    function nonMetadata (fieldName) {
        return fieldName.indexOf('_') !== 0;
    }

    function enumFieldFor (field) {
        const isObject = require('../util/helpers').isObject;

        // Can be the string value or the object key
        if (isObject(field) && Object.keys(field).length > 0) {
            return Object.keys(field)[0];
        }
        else {
            return field;
        }
    }

    function matchesEnum (field, enumSpec) {
        return enumSpec.indexOf(enumFieldFor(field)) >= 0;
    }

    function addMissingFieldError (fieldSpec, path, addErrorFn) {
        // eslint-disable-next-line no-underscore-dangle
        if (fieldSpec._required) {
            addErrorFn(path, 'required');
        }
    }

    function addArrayErrors (fieldSpec, path, field, addErrorFn) {
        const util = require('util');

        if (!util.isArray(field)) {
            addErrorFn(path, 'must be an array');
        }
        else {
            field.forEach(function (subConfig) {
                // Scope error message to array element instead of entire array
                const newAddErrorFn = function (fieldName, message) {
                    return addErrorFn(fieldName, message, subConfig);
                };
                addErrorsFor(subConfig, '', fieldSpec[0], newAddErrorFn);
            });
        }
    }

    function addTypeErrors (fieldSpec, path, field, config, addErrorFn) {
        /* eslint complexity: 0 */
        const util = require('util'),
            helpers = require('../util/helpers'),
            fieldType = typeof field,
            allowedTypes = Object.keys(fieldSpec._allowedTypes), // eslint-disable-line no-underscore-dangle
            typeSpec = fieldSpec._allowedTypes[fieldType]; // eslint-disable-line no-underscore-dangle

        if (!helpers.defined(typeSpec)) {
            addErrorFn(path, typeErrorMessageFor(allowedTypes, fieldSpec._additionalContext)); // eslint-disable-line no-underscore-dangle
        }
        else {
            if (typeSpec.singleKeyOnly && !hasExactlyOneKey(field)) {
                addErrorFn(path, 'must have exactly one key');
            }
            else if (typeSpec.enum && !matchesEnum(field, typeSpec.enum)) {
                addErrorFn(path, util.format('must be one of [%s]', typeSpec.enum.join(', ')));
            }
            else if (typeSpec.nonNegativeInteger && field < 0) {
                addErrorFn(path, 'must be an integer greater than or equal to 0');
            }
            else if (typeSpec.positiveInteger && field <= 0) {
                addErrorFn(path, 'must be an integer greater than 0');
            }

            addErrorsFor(config, path, fieldSpec, addErrorFn);
        }
    }

    function addErrorsFor (config, pathPrefix, spec, addErrorFn) {
        Object.keys(spec).filter(nonMetadata).forEach(fieldName => {
            const util = require('util'),
                helpers = require('../util/helpers'),
                fieldSpec = spec[fieldName],
                path = pathFor(pathPrefix, fieldName),
                field = navigate(config, path);

            if (!helpers.defined(field)) {
                addMissingFieldError(fieldSpec, path, addErrorFn);
            }
            else if (util.isArray(fieldSpec)) {
                addArrayErrors(fieldSpec, path, field, addErrorFn);
            }
            else {
                addTypeErrors(fieldSpec, path, field, config, addErrorFn);
            }
        });
    }

    /**
     * Validates the behavior configuration and returns all errors
     * @memberOf module:models/behaviorsValidator#
     * @param {Object} config - The behavior configuration
     * @param {Object} validationSpec - the specification to validate against
     * @returns {Object} The array of errors
     */
    function validate (config, validationSpec) {
        const errors = [];

        Object.keys(config || {}).forEach(key => {
            const util = require('util'),
                addErrorFn = function (field, message, subConfig) {
                    errors.push(exceptions.ValidationError(
                        util.format('%s behavior "%s" field %s', key, field, message),
                        { source: subConfig || config }));
                },
                spec = {};

            if (validationSpec[key]) {
                spec[key] = validationSpec[key];
                addErrorsFor(config, '', spec, addErrorFn);
            }
        });

        return errors;
    }

    return {
        validate
    };
}

module.exports = {
    create
};
