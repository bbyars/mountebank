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
    xpath = require('./xpath'),
    jsonpath = require('./jsonpath'),
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

function getKeyIgnoringCase (obj, expectedKey) {
    return Object.keys(obj).find(function (key) {
        if (key.toLowerCase() === expectedKey.toLowerCase()) {
            return key;
        }
        else {
            return undefined;
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
        return obj[getKeyIgnoringCase(obj, from)];
    }
}

function regexFlags (options) {
    var result = '';
    if (options && options.ignoreCase) {
        result += 'i';
    }
    if (options && options.multiline) {
        result += 'm';
    }
    return result;
}

function getMatches (selectionFn, selector, logger) {
    var matches = selectionFn();

    if (matches && matches.length > 0) {
        return matches;
    }
    else {
        logger.debug('No match for "%s"', selector);
        return [];
    }
}

function regexValue (from, copyConfig, logger) {
    var regex = new RegExp(copyConfig.using.selector, regexFlags(copyConfig.using.options)),
        selectionFn = function () { return regex.exec(from); };
    return getMatches(selectionFn, regex, logger);
}

function xpathValue (from, copyConfig, logger) {
    var selectionFn = function () {
        return xpath.select(copyConfig.using.selector, copyConfig.using.ns, from, logger);
    };
    return getMatches(selectionFn, copyConfig.using.selector, logger);
}

function jsonpathValue (from, copyConfig, logger) {
    var selectionFn = function () {
        return jsonpath.select(copyConfig.using.selector, from, logger);
    };
    return getMatches(selectionFn, copyConfig.using.selector, logger);
}

function globalStringReplace (str, substring, newSubstring, logger) {
    if (substring !== newSubstring) {
        logger.debug('Replacing %s with %s', JSON.stringify(substring), JSON.stringify(newSubstring));
        return str.split(substring).join(newSubstring);
    }
    else {
        return str;
    }
}

function replace (obj, token, values, logger) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'string') {
            values.forEach(function (replacement, index) {
                // replace ${TOKEN}[1] with indexed element
                var indexedToken = util.format('%s[%s]', token, index);
                obj[key] = globalStringReplace(obj[key], indexedToken, replacement, logger);
            });
            if (values.length > 0) {
                // replace ${TOKEN} with first element
                obj[key] = globalStringReplace(obj[key], token, values[0], logger);
            }
        }
        else if (typeof obj[key] === 'object') {
            replace(obj[key], token, values, logger);
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
                using = copyConfig.using || {},
                fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
                values = [];

            if (fnMap[using.method]) {
                values = fnMap[using.method](from, copyConfig, logger);
            }

            replace(response, copyConfig.into, values, logger);
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
