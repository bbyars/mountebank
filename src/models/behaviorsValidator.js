'use strict';

const exceptions = require('../util/errors.js'),
    helpers = require('../util/helpers.js');

/**
 * The module that does validation of behavior configuration
 * @module
 */

/**
 * Creates the validator
 * @returns {{validate: validate}}
 */
function create () {
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
        const spellings = { number: 'a', object: 'an', string: 'a' };
        let message = `must be ${spellings[allowedTypes[0]]} ${allowedTypes[0]}`;

        for (let i = 1; i < allowedTypes.length; i += 1) {
            message += ` or ${spellings[allowedTypes[i]]} ${allowedTypes[i]}`;
        }
        if (additionalContext) {
            message += `, representing ${additionalContext}`;
        }
        return message;
    }

    function pathFor (pathPrefix, fieldName) {
        if (pathPrefix === '') {
            return fieldName;
        }
        else {
            return `${pathPrefix}.${fieldName}`;
        }
    }

    function nonMetadata (fieldName) {
        return fieldName.indexOf('_') !== 0;
    }

    function isTopLevelSpec (spec) {
        // True of copy and lookup behaviors that define the metadata below the top level keys
        return helpers.isObject(spec)
            && Object.keys(spec).filter(nonMetadata).length === Object.keys(spec).length;

    }
    function enumFieldFor (field) {
        const isObject = helpers.isObject;

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

    function addTypeErrors (fieldSpec, path, field, config, addErrorFn) {
        /* eslint complexity: 0 */
        const fieldType = typeof field,
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
                addErrorFn(path, `must be one of [${typeSpec.enum.join(', ')}]`);
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
            const fieldSpec = spec[fieldName],
                path = pathFor(pathPrefix, fieldName),
                field = navigate(config, path);

            if (!helpers.defined(field)) {
                addMissingFieldError(fieldSpec, path, addErrorFn);
            }
            else if (isTopLevelSpec(fieldSpec)) {
                // Recurse but reset pathPrefix so error message is cleaner
                // e.g. 'copy behavior "from" field required' instead of 'copy behavior "copy.from" field required'
                addErrorsFor(field, '', fieldSpec, addErrorFn);
            }
            else {
                addTypeErrors(fieldSpec, path, field, config, addErrorFn);
            }
        });
    }

    /**
     * Validates the behavior configuration and returns all errors
     * @memberOf module:models/behaviorsValidator#
     * @param {Object} behaviors - The behaviors list
     * @param {Object} validationSpec - the specification to validate against
     * @returns {Object} The array of errors
     */
    function validate (behaviors, validationSpec) {
        const errors = [];

        (behaviors || []).forEach(config => {
            const validBehaviors = [],
                unrecognizedKeys = [];

            Object.keys(config).forEach(key => {
                const addError = function (field, message, subConfig) {
                        errors.push(exceptions.ValidationError(`${key} behavior "${field}" field ${message}`,
                            { source: subConfig || config }));
                    },
                    spec = {};

                if (validationSpec[key]) {
                    validBehaviors.push(key);
                    spec[key] = validationSpec[key];
                    addErrorsFor(config, '', spec, addError);
                }
                else {
                    unrecognizedKeys.push({ key: key, source: config });
                }
            });

            // Allow adding additional custom fields to valid behaviors but ensure there is a valid behavior
            if (validBehaviors.length === 0 && unrecognizedKeys.length > 0) {
                errors.push(exceptions.ValidationError(`Unrecognized behavior: "${unrecognizedKeys[0].key}"`,
                    { source: unrecognizedKeys[0].source }));
            }
            if (validBehaviors.length > 1) {
                errors.push(exceptions.ValidationError('Each behavior object must have only one behavior type',
                    { source: config }));
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
