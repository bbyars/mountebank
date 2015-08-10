'use strict';

var errors = require('../util/errors'),
    helpers = require('../util/helpers'),
    combinators = require('../util/combinators'),
    stringify = require('json-stable-stringify');

function forceStrings (obj) {
    if (typeof obj !== 'object') {
        return obj;
    }
    return Object.keys(obj).reduce(function (result, key) {
        if (Array.isArray(obj[key])) {
            result[key] = obj[key].map(forceStrings);
        }
        else if (typeof obj[key] === 'object') {
            result[key] = forceStrings(obj[key]);
        }
        else if (['boolean', 'number'].indexOf(typeof obj[key]) >= 0) {
            result[key] = obj[key].toString();
        }
        else {
            result[key] = obj[key];
        }
        return result;
    }, {});
}

function normalize (obj, config, encoding) {
    var lowerCase = function (text) { return text.toLowerCase(); },
        caseTransform = config.caseSensitive ? combinators.identity : lowerCase,
        exceptionRemover = function (text) { return text.replace(new RegExp(config.except, 'g'), ''); },
        exceptTransform = config.except ? exceptionRemover : combinators.identity,
        encode = function (text) { return new Buffer(text, 'base64').toString(); },
        encodeTransform = encoding === 'base64' ? encode : combinators.identity,
        transform = combinators.compose(exceptTransform, caseTransform, encodeTransform),
        transformAll = function (o) {
            if (!o) {
                return o;
            }

            if (Array.isArray(o)) {
                return o.map(transformAll);
            }
            else if (typeof o === 'object') {
                return Object.keys(o).reduce(function (result, key) {
                    var value = transformAll(o[key]);
                    result[caseTransform(key)] = value;
                    return result;
                }, {});
            }
            else if (typeof o === 'string') {
                return transform(o);
            }

            return o;
        };

        return transformAll(obj);
}

function predicateSatisfied (expected, actual, predicate) {
    if (!actual) {
      return false;
    }
    return Object.keys(expected).every(function (fieldName) {
        var test = function (value) {
            return predicate(expected[fieldName], value || '');
        };

        if (Array.isArray(actual[fieldName])) {
            return actual[fieldName].some(test);
        }
        else if (typeof expected[fieldName] === 'object') {
            return predicateSatisfied(expected[fieldName], actual[fieldName], predicate);
        }
        else {
            return test(actual[fieldName]);
        }
    });
}

function create (operator, predicateFn) {
    return function (predicate, request, encoding) {
        var expected = normalize(predicate[operator], predicate, encoding),
            actual = normalize(request, predicate, encoding);

        return predicateSatisfied(expected, actual, predicateFn);
    };
}

function deepEquals (predicate, request, encoding) {
    var expected = normalize(forceStrings(predicate.deepEquals), predicate, encoding),
        actual = normalize(forceStrings(request), predicate, encoding);

    return Object.keys(expected).every(function (fieldName) {
        return stringify(expected[fieldName]) === stringify(actual[fieldName]);
    });
}

function matches (predicate, request, encoding) {
    // We want to avoid the lowerCase transform so we don't accidentally butcher
    // a regular expression with upper case metacharacters like \W and \S
    var clone = helpers.merge(predicate, { caseSensitive: true }),
        expected = normalize(predicate.matches, clone, encoding),
        actual = normalize(request, clone, encoding),
        options = predicate.caseSensitive ? '' : 'i';

    if (encoding === 'base64') {
        throw errors.ValidationError('the matches predicate is not allowed in binary mode');
    }

    return predicateSatisfied(expected, actual, function (a, b) { return new RegExp(a, options).test(b); });
}

function resolve (predicate, request, encoding, logger) {
    var keys = Object.keys(predicate);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i],
            predicateFn = module.exports[key];
        if (predicateFn) {
            return predicateFn(predicate, request, encoding, logger);
        }
    }
    throw errors.ValidationError('missing predicate: ' + JSON.stringify(keys), { source: predicate });
}

function not (predicate, request, encoding, logger) {
    return !resolve(predicate.not, request, encoding, logger);
}

function or (predicate, request, encoding, logger) {
    return predicate.or.some(function (subPredicate) {
        return resolve(subPredicate, request, encoding, logger);
    });
}

function and (predicate, request, encoding, logger) {
    return predicate.and.every(function (subPredicate) {
        return resolve(subPredicate, request, encoding, logger);
    });
}

function inject (predicate, request, encoding, logger) {
    /* jshint evil: true, unused: false */
    var scope = helpers.clone(request),
        injected =  '(' + predicate.inject + ')(scope, logger);';

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

module.exports = {
    equals: create('equals', function (expected, actual) { return expected === actual; }),
    deepEquals: deepEquals,
    contains: create('contains', function (expected, actual) { return actual.indexOf(expected) >= 0; }),
    startsWith: create('startsWith', function (expected, actual) { return actual.indexOf(expected) === 0; }),
    endsWith: create('endsWith', function (expected, actual) { return actual.indexOf(expected, actual.length - expected.length) >= 0; }),
    matches: matches,
    exists: create('exists', function (expected, actual) { return expected ? actual.length > 0 : actual.length === 0; }),
    not: not,
    or: or,
    and: and,
    inject: inject,
    resolve: resolve
};
