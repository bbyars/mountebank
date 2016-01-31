'use strict';

/**
 * All the predicates that determine whether a stub matches a request
 * @module
 */

var errors = require('../util/errors'),
    helpers = require('../util/helpers'),
    combinators = require('../util/combinators'),
    stringify = require('json-stable-stringify'),
    xpath = require('xpath'),
    DOMParser = require('xmldom').DOMParser;

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

function xpathSelect (select, selector, doc, encoding) {
    if (encoding === 'base64') {
        throw errors.ValidationError('the xpath predicate parameter is not allowed in binary mode');
    }

    try {
        return select(selector, doc);
    }
    catch (e) {
        throw errors.ValidationError('malformed xpath predicate selector', { inner: e });
    }
}

function nodeValue (node) {
    if (node.nodeType === node.TEXT_NODE) {
        return node.nodeValue;
    }
    else if (node.nodeType === node.ATTRIBUTE_NODE) {
        return node.value;
    }
    else {
        return node.firstChild.data;
    }
}

function selectXPath (config, caseTransform, encoding, text) {
    var doc = new DOMParser().parseFromString(text),
        select = xpath.useNamespaces(config.ns || {}),
        selector = caseTransform(config.selector),
        result = xpathSelect(select, selector, doc, encoding),
        nodeValues;

    if (['number', 'boolean'].indexOf(typeof result) >= 0) {
        return result;
    }

    nodeValues = result.map(nodeValue);

    // Return either a string if one match or array if multiple
    // This matches the behavior of node's handling of query parameters,
    // which allows us to maintain the same semantics between deepEquals
    // (all have to match, passing in an array if necessary) and the other
    // predicates (any can match)
    if (nodeValues.length === 0) {
        return undefined;
    }
    else if (nodeValues.length === 1) {
        return nodeValues[0];
    }
    else {
        // array can match in any order
        return nodeValues.sort();
    }
}

function normalize (obj, config, encoding, withSelectors) {
    var lowerCaser = function (text) { return text.toLowerCase(); },
        caseTransform = config.caseSensitive ? combinators.identity : lowerCaser,
        exceptRegexOptions = config.caseSensitive ? 'g' : 'gi',
        exceptionRemover = function (text) { return text.replace(new RegExp(config.except, exceptRegexOptions), ''); },
        exceptTransform = config.except ? exceptionRemover : combinators.identity,
        encoder = function (text) { return new Buffer(text, 'base64').toString(); },
        encodeTransform = encoding === 'base64' ? encoder : combinators.identity,
        xpathSelector = combinators.curry(selectXPath, config.xpath, caseTransform, encoding),
        xpathTransform = withSelectors && config.xpath ? xpathSelector : combinators.identity,
        transform = combinators.compose(xpathTransform, exceptTransform, caseTransform, encodeTransform),
        transformAll = function (o) {
            if (!o) {
                return o;
            }

            if (Array.isArray(o)) {
                // sort to provide deterministic comparison for deepEquals,
                // where the order in the array for multi-valued querystring keys
                // and xpath selections isn't important
                return o.map(transformAll).sort();
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
        var test = function (value) {
            if (typeof value === 'undefined') {
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
        if (typeof actual[fieldName] === 'undefined' && typeof actual === 'string') {
            actual = tryJSON(actual);
        }

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
        var expected = normalize(predicate[operator], predicate, encoding, false),
            actual = normalize(request, predicate, encoding, true);

        return predicateSatisfied(expected, actual, predicateFn);
    };
}

/**
 * Requires the request field to match the predicate, even if the predicate is an object graph
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function deepEquals (predicate, request, encoding) {
    var expected = normalize(forceStrings(predicate.deepEquals), predicate, encoding, false),
        actual = normalize(forceStrings(request), predicate, encoding, true);

    return Object.keys(expected).every(function (fieldName) {
        // Support predicates that reach into fields encoded in JSON strings (e.g. HTTP bodies)
        if (typeof expected[fieldName] === 'object' && typeof actual[fieldName] === 'string') {
            actual[fieldName] = normalize(forceStrings(tryJSON(actual[fieldName])), predicate, encoding, false);
        }
        return stringify(expected[fieldName]) === stringify(actual[fieldName]);
    });
}

/**
 * Requires the request field to match the regular expression provided by the predicate
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function matches (predicate, request, encoding) {
    // We want to avoid the lowerCase transform so we don't accidentally butcher
    // a regular expression with upper case metacharacters like \W and \S
    var clone = helpers.merge(predicate, { caseSensitive: true }),
        expected = normalize(predicate.matches, clone, encoding, false),
        actual = normalize(request, clone, encoding, true),
        options = predicate.caseSensitive ? '' : 'i';

    if (encoding === 'base64') {
        throw errors.ValidationError('the matches predicate is not allowed in binary mode');
    }

    return predicateSatisfied(expected, actual, function (a, b) { return new RegExp(a, options).test(b); });
}

/**
 * Resolves all predicate keys in given predicate
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function resolve (predicate, request, encoding, logger) {
    var keys = Object.keys(predicate);
    for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i],
            predicateFn = module.exports[key];
        if (predicateFn) {
            return predicateFn(predicate, request, encoding, logger);
        }
    }
    throw errors.ValidationError('missing predicate: ' + JSON.stringify(keys), { source: predicate });
}

/**
 * Inverts a predicate
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function not (predicate, request, encoding, logger) {
    return !resolve(predicate.not, request, encoding, logger);
}

/**
 * Logically ORs two or more predicates
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function or (predicate, request, encoding, logger) {
    return predicate.or.some(function (subPredicate) {
        return resolve(subPredicate, request, encoding, logger);
    });
}

/**
 * Logically ANDs two or more predicates
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function and (predicate, request, encoding, logger) {
    return predicate.and.every(function (subPredicate) {
        return resolve(subPredicate, request, encoding, logger);
    });
}

/**
 * Uses a JavaScript function to determine if the request matches or not
 * @param {Object} predicate - The predicate configuration
 * @param {Object} request - The protocol request object
 * @param {string} encoding - utf8 or base64
 * @param {Object} logger - The logger, useful for debugging purposes
 * @returns {boolean}
 */
function inject (predicate, request, encoding, logger) {
    var scope = helpers.clone(request),
        injected = '(' + predicate.inject + ')(scope, logger);';

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
        throw errors.InjectionError('invalid predicate injection', { source: injected, data: error.message });
    }
}

module.exports = {
    /** Requires the request field to equal the predicate */
    equals: create('equals', function (expected, actual) { return expected === actual; }),
    deepEquals: deepEquals,
    /** Requires the request field to contain the substring provided by the predicate */
    contains: create('contains', function (expected, actual) { return actual.indexOf(expected) >= 0; }),
    /** Requires the request field to start with the prefix provided by the predicate */
    startsWith: create('startsWith', function (expected, actual) { return actual.indexOf(expected) === 0; }),
    /** Requires the request field to end with the suffix provided by the predicate */
    endsWith: create('endsWith', function (expected, actual) { return actual.indexOf(expected, actual.length - expected.length) >= 0; }),
    matches: matches,
    /** Requires the request field to exist and be non-empty, if the predicate is true, or not exist, if false */
    exists: create('exists', function (expected, actual) { return expected ? actual.length > 0 : actual.length === 0; }),
    not: not,
    or: or,
    and: and,
    inject: inject,
    resolve: resolve
};
