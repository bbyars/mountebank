'use strict';

function create () {
    var exceptions = require('../util/errors');

    function hasExactlyOneKey (obj) {
        var keys = Object.keys(obj);
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

    function typeErrorMessageFor (spec) {
        var util = require('util'),
            spellings = { number: 'a', object: 'an', string: 'a', array: 'an' },
            message = util.format('%s behavior "%s" field must be %s %s',
                spec.behaviorName, spec.path, spellings[spec.allowedTypes[0]], spec.allowedTypes[0]);

        for (var i = 1; i < spec.allowedTypes.length; i += 1) {
            message += util.format(' or %s %s', spellings[spec.allowedTypes[i]], spec.allowedTypes[i]);
        }
        if (spec.additionalContext) {
            message += ', representing ' + spec.additionalContext;
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
        // Can be the string value or the object key
        if (typeof field === 'object' && Object.keys(field).length > 0) {
            return Object.keys(field)[0];
        }
        else {
            return field;
        }
    }

    function matchesEnum (field, enumSpec) {
        return enumSpec.indexOf(enumFieldFor(field)) >= 0;
    }

    function addErrorsTo (errors, config, behaviorName, pathPrefix, spec) {
        /* eslint-disable no-underscore-dangle */
        /* eslint complexity: [2, 8] */
        Object.keys(spec).filter(nonMetadata).forEach(function (fieldName) {
            var util = require('util'),
                fieldSpec = spec[fieldName],
                path = pathFor(pathPrefix, fieldName),
                field = navigate(config, path),
                fieldType = typeof field;

            if (fieldType === 'undefined') {
                if (fieldSpec._required) {
                    errors.push(exceptions.ValidationError(
                        util.format('%s behavior "%s" field required', behaviorName, path),
                        { source: config }));
                }
            }
            else {
                var allowedTypes = Object.keys(fieldSpec._allowedTypes),
                    typeSpec = fieldSpec._allowedTypes[fieldType];

                if (typeof typeSpec === 'undefined') {
                    errors.push(exceptions.ValidationError(
                        typeErrorMessageFor({
                            behaviorName: behaviorName,
                            path: path,
                            allowedTypes: allowedTypes,
                            additionalContext: fieldSpec._additionalContext
                        }),
                        { source: config }));
                }
                else {
                    if (typeSpec.singleKeyOnly && !hasExactlyOneKey(field)) {
                        errors.push(exceptions.ValidationError(
                            util.format('%s behavior "%s" field must have exactly one key',
                                behaviorName, path),
                            { source: config }));
                    }
                    else if (typeSpec.enum && !matchesEnum(field, typeSpec.enum)) {
                        errors.push(exceptions.ValidationError(
                            util.format('%s behavior "%s" field must be one of [%s]',
                                behaviorName, path, typeSpec.enum.join(', ')),
                            { source: config }));
                    }
                    else if (typeSpec.nonNegativeInteger && field < 0) {
                        errors.push(exceptions.ValidationError(
                            util.format('%s behavior "%s" field must be an integer greater than or equal to 0',
                                behaviorName, path),
                            { source: config }));
                    }
                    else if (typeSpec.positiveInteger && field <= 0) {
                        errors.push(exceptions.ValidationError(
                            util.format('%s behavior "%s" field must be an integer greater than 0',
                                behaviorName, path),
                            { source: config }));
                    }

                    addErrorsTo(errors, config, behaviorName, path, fieldSpec);
                }
            }
        });
    }

    return {
        addErrorsTo: addErrorsTo
    };
}

module.exports = {
    create: create
};
