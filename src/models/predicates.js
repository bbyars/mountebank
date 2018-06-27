'use strict';

/**
 * All the predicates that determine whether a stub matches a request
 * @module
 */

function isNonNullObject (o) {
    return typeof o === 'object' && o !== null;
}

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
    if (!isNonNullObject(obj)) {
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
            else if (obj[key] === null) {
                result[key] = 'null';
            }
            else if (isNonNullObject(obj[key])) {
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
        return possibleArray.sort(sortObjects);
    }
    else {
        return possibleArray;
    }
}

function transformObject (obj, transform) {
    Object.keys(obj).forEach(function (key) {
        obj[key] = transform(obj[key]);
    });
    return obj;
}

function selectXPath (config, encoding, text) {
    var xpath = require('./xpath'),
        combinators = require('../util/combinators'),
        selectFn = combinators.curry(xpath.select, config.selector, config.ns, text);

    return orderIndependent(select('xpath', selectFn, encoding));
}

function selectTransform (config, options) {
    var combinators = require('../util/combinators'),
        helpers = require('../util/helpers'),
        cloned = helpers.clone(config);

    if (config.jsonpath) {
        var stringTransform = options.shouldForceStrings ? forceStrings : combinators.identity;

        // use keyCaseSensitive instead of caseSensitive to help "matches" predicates too
        // see https://github.com/bbyars/mountebank/issues/361
        if (!cloned.keyCaseSensitive) {
            cloned.jsonpath.selector = cloned.jsonpath.selector.toLowerCase();
        }

        return combinators.curry(selectJSONPath, cloned.jsonpath, options.encoding, config, stringTransform);
    }
    else if (config.xpath) {
        if (!cloned.caseSensitive) {
            cloned.xpath.ns = transformObject(cloned.xpath.ns || {}, lowercase);
            cloned.xpath.selector = cloned.xpath.selector.toLowerCase();
        }
        return combinators.curry(selectXPath, cloned.xpath, options.encoding);
    }
    else {
        return combinators.identity;
    }
}

function lowercase (text) {
    return text.toLowerCase();
}

function caseTransform (config) {
    var combinators = require('../util/combinators');
    return config.caseSensitive ? combinators.identity : lowercase;
}

function exceptTransform (config) {
    var combinators = require('../util/combinators'),
        exceptRegexOptions = config.caseSensitive ? 'g' : 'gi';

    if (config.except) {
        return function (text) { return text.replace(new RegExp(config.except, exceptRegexOptions), ''); };
    }
    else {
        return combinators.identity;
    }
}

function encodingTransform (encoding) {
    var combinators = require('../util/combinators');
    if (encoding === 'base64') {
        return function (text) { return new Buffer(text, 'base64').toString(); };
    }
    else {
        return combinators.identity;
    }
}

function tryJSON (value, predicateConfig) {
    try {
        var keyCaseTransform = predicateConfig.keyCaseSensitive === false ? lowercase : caseTransform(predicateConfig),
            valueTransforms = [exceptTransform(predicateConfig), caseTransform(predicateConfig)];

        // We can't call normalize because we want to avoid the array sort transform,
        // which will mess up indexed selectors like $..title[1]
        return transformAll(JSON.parse(value), [keyCaseTransform], valueTransforms, []);
    }
    catch (e) {
        return value;
    }
}

function selectJSONPath (config, encoding, predicateConfig, stringTransform, text) {
    var jsonpath = require('./jsonpath'),
        combinators = require('../util/combinators'),
        possibleJSON = stringTransform(tryJSON(text, predicateConfig)),
        selectFn = combinators.curry(jsonpath.select, config.selector, possibleJSON);

    return orderIndependent(select('jsonpath', selectFn, encoding));
}

function transformAll (obj, keyTransforms, valueTransforms, arrayTransforms) {
    var combinators = require('../util/combinators'),
        apply = function (fns) { return combinators.compose.apply(null, fns); };

    if (Array.isArray(obj)) {
        return apply(arrayTransforms)(obj.map(function (element) {
            return transformAll(element, keyTransforms, valueTransforms, arrayTransforms);
        }));
    }
    else if (isNonNullObject(obj)) {
        return Object.keys(obj).reduce(function (result, key) {
            result[apply(keyTransforms)(key)] = transformAll(obj[key], keyTransforms, valueTransforms, arrayTransforms);
            return result;
        }, {});
    }
    else if (typeof obj === 'string') {
        return apply(valueTransforms)(obj);
    }
    else {
        return obj;
    }
}

function normalize (obj, config, options) {
    // Needed to solve a tricky case conversion for "matches" predicates with jsonpath/xpath parameters
    if (typeof config.keyCaseSensitive === 'undefined') {
        config.keyCaseSensitive = config.caseSensitive;
    }

    var keyCaseTransform = config.keyCaseSensitive === false ? lowercase : caseTransform(config),
        sortTransform = function (array) { return array.sort(sortObjects); },
        transforms = [];

    if (options.withSelectors) {
        transforms.push(selectTransform(config, options));
    }

    transforms.push(exceptTransform(config));
    transforms.push(caseTransform(config));
    transforms.push(encodingTransform(options.encoding));

    // sort to provide deterministic comparison for deepEquals,
    // where the order in the array for multi-valued querystring keys
    // and xpath selections isn't important
    return transformAll(obj, [keyCaseTransform], transforms, [sortTransform]);
}

function testPredicate (expected, actual, predicateConfig, predicateFn) {
    var helpers = require('../util/helpers');
    if (!helpers.defined(actual)) {
        actual = '';
    }
    if (isNonNullObject(expected)) {
        return predicateSatisfied(expected, actual, predicateConfig, predicateFn);
    }
    else {
        return predicateFn(expected, actual);
    }
}

function bothArrays (expected, actual) {
    return Array.isArray(actual) && Array.isArray(expected);
}

function allExpectedArrayValuesMatchActualArray (expectedArray, actualArray, predicateConfig, predicateFn) {
    return expectedArray.every(function (expectedValue) {
        return actualArray.some(function (actualValue) {
            return testPredicate(expectedValue, actualValue, predicateConfig, predicateFn);
        });
    });
}

function onlyActualIsArray (expected, actual) {
    return Array.isArray(actual) && !Array.isArray(expected);
}

function expectedMatchesAtLeastOneValueInActualArray (expected, actualArray, predicateConfig, predicateFn) {
    return actualArray.some(function (actual) {
        return testPredicate(expected, actual, predicateConfig, predicateFn);
    });
}

function expectedLeftOffArraySyntaxButActualIsArrayOfObjects (expected, actual, fieldName) {
    var helpers = require('../util/helpers');
    return !Array.isArray(expected[fieldName]) && !helpers.defined(actual[fieldName]) && Array.isArray(actual);
}

function predicateSatisfied (expected, actual, predicateConfig, predicateFn) {
    if (!actual) {
        return false;
    }

    // Support predicates that reach into fields encoded in JSON strings (e.g. HTTP bodies)
    if (typeof actual === 'string') {
        actual = tryJSON(actual, predicateConfig);
    }

    return Object.keys(expected).every(function (fieldName) {
        if (bothArrays(expected[fieldName], actual[fieldName])) {
            return allExpectedArrayValuesMatchActualArray(
                expected[fieldName], actual[fieldName], predicateConfig, predicateFn);
        }
        else if (onlyActualIsArray(expected[fieldName], actual[fieldName])) {
            if (predicateConfig.exists && expected[fieldName]) {
                return true;
            }
            else {
                return expectedMatchesAtLeastOneValueInActualArray(
                    expected[fieldName], actual[fieldName], predicateConfig, predicateFn);
            }
        }
        else if (expectedLeftOffArraySyntaxButActualIsArrayOfObjects(expected, actual, fieldName)) {
            // This is a little confusing, but predated the ability for users to specify an
            // array for the expected values and is left for backwards compatibility.
            // The predicate might be:
            //     { equals: { examples: { key: 'third' } } }
            // and the request might be
            //     { examples: '[{ "key": "first" }, { "different": true }, { "key": "third" }]' }
            // We expect that the "key" field in the predicate definition matches any object key
            // in the actual array
            return expectedMatchesAtLeastOneValueInActualArray(expected, actual, predicateConfig, predicateFn);
        }
        else if (isNonNullObject(expected[fieldName])) {
            return predicateSatisfied(expected[fieldName], actual[fieldName], predicateConfig, predicateFn);
        }
        else {
            return testPredicate(expected[fieldName], actual[fieldName], predicateConfig, predicateFn);
        }
    });
}

function create (operator, predicateFn) {
    return function (predicate, request, encoding) {
        var expected = normalize(predicate[operator], predicate, { encoding: encoding }),
            actual = normalize(request, predicate, { encoding: encoding, withSelectors: true });

        return predicateSatisfied(expected, actual, predicate, predicateFn);
    };
}

function deepEquals (predicate, request, encoding) {
    var expected = normalize(forceStrings(predicate.deepEquals), predicate, { encoding: encoding }),
        actual = normalize(forceStrings(request), predicate, { encoding: encoding, withSelectors: true, shouldForceStrings: true }),
        stringify = require('json-stable-stringify');

    return Object.keys(expected).every(function (fieldName) {
        // Support predicates that reach into fields encoded in JSON strings (e.g. HTTP bodies)
        if (isNonNullObject(expected[fieldName]) && typeof actual[fieldName] === 'string') {
            var possibleJSON = tryJSON(actual[fieldName], predicate);
            actual[fieldName] = normalize(forceStrings(possibleJSON), predicate, { encoding: encoding });
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
        expected = normalize(predicate.matches, clone, { encoding: encoding }),
        actual = normalize(request, clone, { encoding: encoding, withSelectors: true }),
        options = caseSensitive ? '' : 'i',
        errors = require('../util/errors');

    if (encoding === 'base64') {
        throw errors.ValidationError('the matches predicate is not allowed in binary mode');
    }

    return predicateSatisfied(expected, actual, clone, function (a, b) { return new RegExp(a, options).test(b); });
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
    exists: create('exists', function (expected, actual) { return expected ? (actual !== undefined && actual !== '') : (actual === undefined || actual === ''); }),
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
