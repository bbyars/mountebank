'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q'),
    exec = require('child_process').exec,
    util = require('util'),
    combinators = require('../util/combinators'),
    xpath = require('xpath'),
    JSONPath = require('jsonpath-plus'),
    DOMParser = require('xmldom').DOMParser,
    isWindows = require('os').platform().indexOf('win') === 0;

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, responsePromise, millisecondsOrFn, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    var fn = util.format('(%s)()', millisecondsOrFn),
        milliseconds = parseInt(millisecondsOrFn);

    if (isNaN(milliseconds)) {
        try {
            milliseconds = eval(fn);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(fn));
            return Q.reject(errors.InjectionError('invalid wait injection',
                { source: millisecondsOrFn, data: error.message }));
        }
    }

    logger.debug('Waiting %s ms...', milliseconds);
    return responsePromise.delay(milliseconds);
}

function quoteForShell (obj) {
    var json = JSON.stringify(obj);

    if (isWindows) {
        // Confused? Me too. All other approaches I tried were spectacular failures
        // in both 1) keeping the JSON as a single CLI arg, and 2) maintaining the inner quotes
        return util.format('"%s"', json.replace(/"/g, '\\"'));
    }
    else {
        return util.format("'%s'", json);
    }
}

/**
 * Runs the response through a shell function, passing the JSON in as stdin and using
 * stdout as the new response
 * @param {Object} request - Will be the first arg to the command
 * @param {Object} responsePromise - The promise chain for building the response, which will be the second arg
 * @param {string} command - The shell command to execute
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function shellTransform (request, responsePromise, command, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var deferred = Q.defer(),
            fullCommand = util.format('%s %s %s', command, quoteForShell(request), quoteForShell(response));

        logger.debug('Shelling out to %s', command);
        logger.debug(fullCommand);

        exec(fullCommand, function (error, stdout, stderr) {
            if (error) {
                if (stderr) {
                    logger.error(stderr);
                }
                deferred.reject(error.message);
            }
            else {
                logger.debug("Shell returned '%s'", stdout);
                try {
                    deferred.resolve(Q(JSON.parse(stdout)));
                }
                catch (err) {
                    deferred.reject(util.format("Shell command returned invalid JSON: '%s'", stdout));
                }
            }
        });
        return deferred.promise;
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function decorate (originalRequest, responsePromise, fn, logger) {
    if (originalRequest.isDryRun === true) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);';

        try {
            // Support functions that mutate response in place and those
            // that return a new response
            var result = eval(injected);
            if (!result) {
                result = response;
            }
            return Q(result);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
        }
    });
}

function getFrom (obj, from) {
    if (typeof from === 'object') {
        var keys = Object.keys(from);
        if (keys.length === 0 || keys.length > 1) {
            throw errors.ValidationError('copy behavior "from" field can only have one key per object',
                { source: from });
        }
        return getFrom(obj[keys[0]], from[keys[0]]);
    }
    else {
        return obj[from];
    }
}

function hasMoreThanOneSelector (copyConfig) {
    return (copyConfig.regex && copyConfig.xpath) ||
        (copyConfig.regex && copyConfig.jsonpath) ||
        (copyConfig.xpath && copyConfig.jsonpath);
}

function regexFlags (config) {
    var result = '';
    if (config.ignoreCase) {
        result += 'i';
    }
    if (config.multiline) {
        result += 'm';
    }
    return result;
}

function regexValue (from, copyConfig, defaultValue, logger) {
    var matches = new RegExp(copyConfig.regex.pattern, regexFlags(copyConfig.regex)).exec(from);
    if (matches && matches.length >= 2) {
        logger.debug('Replacing %s with %s', copyConfig.into, matches[1]);
        return matches[1];
    }
    else {
        logger.debug('No match for /%s/ (be sure to set a match group)', copyConfig.regex.pattern);
        return defaultValue;
    }
}

function nodeValue (node) {
    if (node.nodeType === node.TEXT_NODE) {
        return node.nodeValue;
    }
    else if (node.nodeType === node.ATTRIBUTE_NODE) {
        return node.value;
    }
    else if (node.firstChild) {
        return node.firstChild.data + '';
    }
    else {
        return node.data + '';
    }
}

function xpathValue (from, copyConfig, defaultValue, logger) {
    var doc = new DOMParser().parseFromString(from),
        select = xpath.useNamespaces(copyConfig.xpath.ns || {}),
        nodes = select(copyConfig.xpath.selector, doc);

    if (nodes.length > 0) {
        logger.debug('Replacing %s with %s', copyConfig.into, nodeValue(nodes[0]));
        return nodeValue(nodes[0]);
    }
    else {
        logger.debug('No match for "%s"', copyConfig.xpath.selector);
        return defaultValue;
    }
}

function selectJSONPath (possibleJSON, selector) {
    try {
        var result = JSONPath.eval(JSON.parse(possibleJSON), selector);
        if (typeof result === 'string') {
            return result;
        }
        else if (result.length === 0) {
            return undefined;
        }
        else {
            return result[0];
        }
    }
    catch (e) {
        return undefined;
    }
}

function jsonpathValue (from, copyConfig, defaultValue, logger) {
    var jsonValue = selectJSONPath(from, copyConfig.jsonpath.selector);
    if (typeof jsonValue !== 'undefined') {
        logger.debug('Replacing %s with %s', copyConfig.into, jsonValue);
        return jsonValue;
    }
    else {
        logger.debug('No match for "%s"', copyConfig.jsonpath.selector);
        return defaultValue;
    }
}

function replace (obj, token, replacement) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key].split(token).join(replacement);
        }
        else if (typeof obj[key] === 'object') {
            replace(obj[key], token, replacement);
        }
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} copyArray - The list of values to copy
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copy (originalRequest, responsePromise, copyArray, logger) {
    if (!util.isArray(copyArray)) {
        return Q.reject(errors.ValidationError('copy behavior must be an array', { source: { copy: copyArray } }));
    }

    return responsePromise.then(function (response) {
        copyArray.forEach(function (copyConfig) {
            var from = getFrom(originalRequest, copyConfig.from),
                value = copyConfig.into;

            if (hasMoreThanOneSelector(copyConfig)) {
                throw errors.ValidationError('each copy behavior can only use one of [regex, xpath, jsonpath]',
                    { source: copyConfig });
            }

            if (copyConfig.regex) {
                value = regexValue(from, copyConfig, value, logger);
            }
            else if (copyConfig.xpath) {
                value = xpathValue(from, copyConfig, value, logger);
            }
            else if (copyConfig.jsonpath) {
                value = jsonpathValue(from, copyConfig, value, logger);
            }

            replace(response, copyConfig.into, value);
        });
        return Q(response);
    });
}

/**
 * The entry point to execute all behaviors provided in the API
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} behaviors - The behaviors specified in the API
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object}
 */
function execute (request, response, behaviors, logger) {
    if (!behaviors) {
        return Q(response);
    }

    var waitFn = behaviors.wait ?
            function (result) { return wait(request, result, behaviors.wait, logger); } :
            combinators.identity,
        copyFn = behaviors.copy ?
            function (result) { return copy(request, result, behaviors.copy, logger); } :
            combinators.identity,
        shellTransformFn = behaviors.shellTransform ?
            function (result) { return shellTransform(request, result, behaviors.shellTransform, logger); } :
            combinators.identity,
        decorateFn = behaviors.decorate ?
            function (result) { return decorate(request, result, behaviors.decorate, logger); } :
            combinators.identity;

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    return combinators.compose(decorateFn, shellTransformFn, copyFn, waitFn, Q)(response);
}

module.exports = {
    wait: wait,
    decorate: decorate,
    shellTransform: shellTransform,
    copy: copy,
    execute: execute
};
