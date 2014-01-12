'use strict';

var errors = require('../util/errors'),
    helpers = require('../util/helpers');

function getCaseInsensitive (obj, fieldName) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
        if (fieldName.toLowerCase() === keys[i].toLowerCase()) {
            return obj[keys[i]];
        }
    }
    return '';
}

function getNested (obj, fieldName) {
    return fieldName.split('.').reduce(getCaseInsensitive, obj);
}

function normalize (text, encoding) {
    if (encoding === 'base64') {
        return new Buffer(text, 'base64').toJSON().toString();
    }
    else {
        return text.toLowerCase();
    }
}

function create (predicate) {
    return function (fieldName, expected, request, encoding) {
        var actual = getNested(request, fieldName);

        if (typeof expected === 'string') {
            actual = normalize(actual, encoding);
            expected = normalize(expected, encoding);
        }
        if (['string', 'boolean'].indexOf(typeof expected) >= 0) {
            return predicate(actual, expected, encoding);
        }
        else {
            return false;
        }
    };
}

module.exports = {
    is: create(function (actual, expected) { return actual === expected; }),
    contains: create(function (actual, expected) { return actual.indexOf(expected) >= 0; }),
    startsWith: create(function (actual, expected) { return actual.indexOf(expected) === 0; }),
    endsWith: create(function (actual, expected) { return actual.indexOf(expected, actual.length - expected.length) >= 0; }),
    matches: create(function (actual, expected, encoding) {
        if (encoding === 'base64') {
            throw errors.ValidationError('the matches predicate is not allowed in binary mode');
        }
        else {
            return new RegExp(expected).test(actual);
        }
    }),
    exists: create(function (actual, expected) { return expected ? actual.length > 0 : actual.length === 0; }),
    not: function (fieldName, expected, request) {
        return !Object.keys(expected).some(function (predicate) {
            return module.exports[predicate](fieldName, expected[predicate], request);
        });
    },
    or: function (fieldName, expected, request) {
        return expected.some(function (predicate) {
            return Object.keys(predicate).every(function (subPredicate) {
                return module.exports[subPredicate](fieldName, predicate[subPredicate], request);
            });
        });
    },
    and: function (fieldName, expected, request) {
        return expected.every(function (predicate) {
            return Object.keys(predicate).every(function (subPredicate) {
                return module.exports[subPredicate](fieldName, predicate[subPredicate], request);
            });
        });
    },

    /* jshint maxparams: 5 */
    inject: function (fieldName, predicate, request, encoding, logger) {
        /* jshint evil: true, unused: false */
        var arg = fieldName === 'request' ? request : request[fieldName],
            scope = helpers.clone(arg), // prevent state-changing operations
            injected =  '(' + predicate + ')(scope, logger);';
        try {
            return eval(injected);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    source: ' + JSON.stringify(injected));
            logger.error('    scope: ' + JSON.stringify(scope));
            throw errors.InjectionError('invalid predicate injection', { source: injected, data: error.message });
        }
    }
};
