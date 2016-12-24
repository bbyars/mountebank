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

function isJSON (json) {
    try {
        JSON.parse(json);
    }
    catch (e) {
        return false;
    }
    return true;
}

function isXML (xml) {
    var parseString = require('xml2js').parseString,
        result = '';

    parseString(xml, function (err) {
        if (err === null) {
            result = true;
        }
        else {
            result = false;
        }
    });
    if (result === true) {
        return true;
    }
    else {
        return false;
    }
}

function isCheck (request) {
    var type = '';

    if (isXML(request)) {
        type = 'XML';
    }
    else if (isJSON(request)) {
        type = 'JSON';
    }
    return type;
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
    /* eslint-disable complexity */
    /* eslint-disable max-depth */
    if (!util.isArray(copyArray)) {
        return Q.reject(errors.ValidationError('copy behavior must be an array', { source: { copy: copyArray } }));
    }

    if (copyArray[0].regex) {
        return responsePromise.then(function (response) {
            copyArray.forEach(function (copyConfig) {
                var from = originalRequest[copyConfig.from],
                    value = copyConfig.into;

                if (copyConfig.regex) {
                    var matches = new RegExp(copyConfig.regex.pattern, regexFlags(copyConfig.regex)).exec(from);
                    if (matches && matches.length >= 2) {
                        value = matches[1];
                        logger.debug('Replacing %s with %s', copyConfig.into, value);
                    }
                    else {
                        logger.debug('No match for /%s/', copyConfig.regex.pattern);
                    }
                }

                replace(response, copyConfig.into, value);
            });
            return Q(response);
        });
    }


    return responsePromise.then(function (response) {
        var result = response;
        var messageType = originalRequest.body,
            requestType = isCheck(messageType),
            xpath = require('xpath'),
            dom = require('xmldom').DOMParser,
            xml = originalRequest.body,
            parseJson = require('parse-json'),
            JSONPath = require('jsonpath-plus'),
            JSONReq = originalRequest.body,
            appBody = result.body,
            cleanResponse = appBody,
            title,
            doc = new dom().parseFromString(xml);

        for (var key1 in copyArray) {
            for (var subkey1 in copyArray[key1]) {
                var Param1 = (copyArray[key1][subkey1]).toString();
                if ((Param1.localeCompare('path') === 0)) {
                    title = originalRequest.path.split('/')[copyArray[key1].uri];
                    if ((title === undefined) || (title === '')) {
                        result.statusCode = 404;
                        result.body = 'Copy criteria does not match\r\nCorresponding value of "' + Param1 + '" is Undefined or null.';
                        return Q(result);
                    }
                    var initialIndex = 0;
                    do {
                        cleanResponse = cleanResponse.replace(copyArray[key1].into, title);
                    } while ((initialIndex = cleanResponse.indexOf(copyArray[key1].into, initialIndex + 1)) > -1);
                }

                if ((Param1.localeCompare('query') === 0)) {
                    var queryParam = copyArray[key1].param;
                    title = originalRequest.query[queryParam];
                    if ((title === undefined) || (title === null) || (title === '')) {
                        result.statusCode = 404;
                        result.body = 'Copy criteria does not match\r\nCorresponding value of "' + Param1 + '" is Undefined or null.';
                        return Q(result);
                    }
                    initialIndex = 0;
                    do {
                        cleanResponse = cleanResponse.replace(copyArray[key1].into, title);
                    } while ((initialIndex = cleanResponse.indexOf(copyArray[key1].into, initialIndex + 1)) > -1);
                }

                if ((Param1.localeCompare('headers') === 0)) {
                    var headerValue = copyArray[key1].value;
                    title = originalRequest.headers[headerValue];
                    if ((title === undefined) || (title === null)) {
                        result.statusCode = 404;
                        result.body = 'Copy criteria does not match\r\nCorresponding value of "' + Param1 + '" is Undefined or null.';
                        return Q(result);
                    }
                    initialIndex = 0;
                    do {
                        cleanResponse = cleanResponse.replace(copyArray[key1].into, title);
                    } while ((initialIndex = cleanResponse.indexOf(copyArray[key1].into, initialIndex + 1)) > -1);
                }

                for (var subkey2 in copyArray[key1][subkey1]) {
                    if ((subkey2).localeCompare('selector') === 0) {
                        var reqPath = copyArray[key1][subkey1][subkey2];
                        if (requestType.localeCompare('XML') === 0) {
                            doc = new dom().parseFromString(xml);
                            title = xpath.select(reqPath, doc).toString();
                        }
                        else if (requestType.localeCompare('JSON') === 0) {
                            var JSONDoc = parseJson(JSONReq);
                            title = JSONPath(reqPath, JSONDoc).toString();
                        }
                        if ((title === undefined) || (title === null) || (title === '')) {
                            result.statusCode = 404;
                            result.body = 'Copy criteria does not match\r\nCorresponding value of "' + subkey2 + '" is Undefined or null.';
                            return Q(result);
                        }
                        initialIndex = 0;
                        do {
                            cleanResponse = cleanResponse.replace(copyArray[key1].into, title);
                        } while ((initialIndex = cleanResponse.indexOf(copyArray[key1].into, initialIndex + 1)) > -1);
                    }
                }
            }
        }
        result.body = cleanResponse;
        return Q(result);
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
