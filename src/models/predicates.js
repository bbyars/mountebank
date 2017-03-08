'use strict';

/**
 * All the predicates that determine whether a stub matches a request
 * @module
 */

function sortObjects (a, b) {
    var stringify = require('json-stable-stringify');

    if (typeof a === 'object' && typeof b === 'object') {
        // Make best effort at sorting arrays of objects to make
        // deepEquals order-independent
        return sortObjects(stringify(a), stringify(b));
    }
    else if (a < b) {
        return -1;
    }
    else {
        return 1;
    }
}

function forceStrings (obj) {
    if (typeof obj !== 'object') {
        return obj;
    }
    else if (Array.isArray(obj)) {
        return obj.map(forceStrings);
    }
    else {
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
}

function select (type, selectFn, encoding) {
    if (encoding === 'base64') {
        var errors = require('../util/errors');
        throw errors.ValidationError('the ' + type + ' predicate parameter is not allowed in binary mode');
    }

    var nodeValues = selectFn();

    // Return either a string if one match or array if multiple
    // This matches the behavior of node's handling of query parameters,
    // which allows us to maintain the same semantics between deepEquals
    // (all have to match, passing in an array if necessary) and the other
    // predicates (any can match)
    if (nodeValues && nodeValues.length === 1) {
        return nodeValues[0];
    }
    else {
        return nodeValues;
    }
}

function orderIndependent (possibleArray) {
    var util = require('util');

    if (util.isArray(possibleArray)) {
        return possibleArray.sort();
    }
    else {
        return possibleArray;
    }
}

function selectXPath (config, caseTransform, encoding, text) {
    var xpath = require('./xpath'),
        combinators = require('../util/combinators'),
        ns = normalize(config.ns, {}, 'utf8'),
        selectFn = combinators.curry(xpath.select, caseTransform(config.selector), ns, text);
    return orderIndependent(select('xpath', selectFn, encoding));
}

function selectJSONPath (config, caseTransform, encoding, text) {
    var jsonpath = require('./jsonpath'),
        combinators = require('../util/combinators'),
        selectFn = combinators.curry(jsonpath.select, caseTransform(config.selector), text);
    return orderIndependent(select('jsonpath', selectFn, encoding));
}

function normalize (obj, config, encoding, withSelectors) {
    /* eslint complexity: [2, 8] */
    var combinators = require('../util/combinators'),
        lowerCaser = function (text) { return text.toLowerCase(); },
        caseTransform = config.caseSensitive ? combinators.identity : lowerCaser,
        keyCaseTransform = config.keyCaseSensitive === false ? lowerCaser : caseTransform,
        exceptRegexOptions = config.caseSensitive ? 'g' : 'gi',
        exceptionRemover = function (text) { return text.replace(new RegExp(config.except, exceptRegexOptions), ''); },
        exceptTransform = config.except ? exceptionRemover : combinators.identity,
        encoder = function (text) { return new Buffer(text, 'base64').toString(); },
        encodeTransform = encoding === 'base64' ? encoder : combinators.identity,
        xpathSelector = combinators.curry(selectXPath, config.xpath, caseTransform, encoding),
        xpathTransform = withSelectors && config.xpath ? xpathSelector : combinators.identity,
        jsonPathSelector = combinators.curry(selectJSONPath, config.jsonpath, caseTransform, encoding),
        jsonPathTransform = withSelectors && config.jsonpath ? jsonPathSelector : combinators.identity,
        transform = combinators.compose(jsonPathTransform, xpathTransform, exceptTransform, caseTransform, encodeTransform),
        transformAll = function (o) {
            if (!o) {
                return o;
            }

            if (Array.isArray(o)) {
                // sort to provide deterministic comparison for deepEquals,
                // where the order in the array for multi-valued querystring keys
                // and xpath selections isn't important
                return o.map(transformAll).sort(sortObjects);
            }
            else if (typeof o === 'object') {
                return Object.keys(o).reduce(function (result, key) {
                    result[keyCaseTransform(key)] = transformAll(o[key]);
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

function tryJSON (value) {
    try {
        return JSON.parse(value);
    }
    catch (e) {
        return value;
    }
}

function predicateSatisfied (expected, actual, predicate) {
    if (!actual) {
        return false;
    }

    return Object.keys(expected).every(function (fieldName) {
        var helpers = require('../util/helpers');

        var test = function (value) {
            if (!helpers.defined(value)) {
                value = '';
            }
            if (typeof expected[fieldName] === 'object') {
                return predicateSatisfied(expected[fieldName], value, predicate);
            }
            else {
                return predicate(expected[fieldName], value);
            }
        };

        // Support predicates that reach into fields encoded in JSON strings (e.g. HTTP bodies)
        if (!helpers.defined(actual[fieldName]) && typeof actual === 'string') {
            actual = tryJSON(actual);
        }

        if (Array.isArray(actual[fieldName])) {
            return actual[fieldName].some(test);
        }
        else if (!helpers.defined(actual[fieldName]) && Array.isArray(actual)) {
            // support array of objects in JSON
            return actual.some(function (element) {
                return predicateSatisfied(expected, element, predicate);
            });
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
        var expected = normalize(predicate[operator], predicate, encoding, false),
            actual = normalize(request, predicate, encoding, true);

        return predicateSatisfied(expected, actual, predicateFn);
    };
}

function deepEquals (predicate, request, encoding) {
    var expected = normalize(forceStrings(predicate.deepEquals), predicate, encoding, false),
        actual = normalize(forceStrings(request), predicate, encoding, true),
        stringify = require('json-stable-stringify');

    return Object.keys(expected).every(function (fieldName) {
        // Support predicates that reach into fields encoded in JSON strings (e.g. HTTP bodies)
        if (typeof expected[fieldName] === 'object' && typeof actual[fieldName] === 'string') {
            actual[fieldName] = normalize(forceStrings(tryJSON(actual[fieldName])), predicate, encoding, false);
        }
        return stringify(expected[fieldName]) === stringify(actual[fieldName]);
    });
}

function matches (predicate, request, encoding) {
    // We want to avoid the lowerCase transform on values so we don't accidentally butcher
    // a regular expression with upper case metacharacters like \W and \S
    // However, we need to maintain the case transform for keys like http header names (issue #169)
    // eslint-disable-next-line no-unneeded-ternary
    var caseSensitive = predicate.caseSensitive ? true : false, // convert to boolean even if undefined
        helpers = require('../util/helpers'),
        clone = helpers.merge(predicate, { caseSensitive: true, keyCaseSensitive: caseSensitive }),
        expected = normalize(predicate.matches, clone, encoding, false),
        actual = normalize(request, clone, encoding, true),
        options = caseSensitive ? '' : 'i',
        errors = require('../util/errors');

    if (encoding === 'base64') {
        throw errors.ValidationError('the matches predicate is not allowed in binary mode');
    }

    return predicateSatisfied(expected, actual, function (a, b) { return new RegExp(a, options).test(b); });
}

function not (predicate, request, encoding, logger) {
    return !evaluate(predicate.not, request, encoding, logger);
}

function evaluateFn (request, encoding, logger) {
    return function (subPredicate) {
        return evaluate(subPredicate, request, encoding, logger);
    };
}

function or (predicate, request, encoding, logger) {
    return predicate.or.some(evaluateFn(request, encoding, logger));
}

function and (predicate, request, encoding, logger) {
    return predicate.and.every(evaluateFn(request, encoding, logger));
}

function inject (predicate, request, encoding, logger, imposterState) {
    var helpers = require('../util/helpers'),
        scope = helpers.clone(request),
        injected = '(' + predicate.inject + ')(scope, logger, imposterState);',
        errors = require('../util/errors');

    if (request.isDryRun === true) {
        return true;
    }

    try {
        return eval(injected);
    }
    catch (error) {
        logger.error('injection X=> ' + error);
        logger.error('    source: ' + JSON.stringify(injected));
        logger.error('    scope: ' + JSON.stringify(scope));
        logger.error('    imposterState: ' + JSON.stringify(imposterState));
        throw errors.InjectionError('invalid predicate injection', { source: injected, data: error.message });
    }
}

var predicates = {
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
    inject: inject
};

/**
 * Resolves all predicate keys in given predicate
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @param {Object} imposterState - The current state for the imposter
 * @returns {boolean}
 */
function evaluate (predicate, request, encoding, logger, imposterState) {
    var predicateFn = Object.keys(predicate).find(function (key) {
            return Object.keys(predicates).indexOf(key) >= 0;
        }),
        errors = require('../util/errors');

    if (predicateFn) {
        return predicates[predicateFn](predicate, request, encoding, logger, imposterState);
    }
    else {
        throw errors.ValidationError('missing predicate', { source: predicate });
    }
}

module.exports = {
    evaluate: evaluate
};
