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
    isWindows = require('os').platform().indexOf('win') === 0;

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, response, responsePromise, millisecondsOrFn, logger) {
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
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
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

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copyFrom (originalRequest, responsePromise, fn, logger) {
    /* eslint complexity: 0 */
    /* eslint max-depth: 0 */
    return responsePromise.then(function (response) {
        var fn2 = 'function (request, response) {}',
            request = helpers.clone(originalRequest),
            injected = '(' + fn2 + ')(request, response, logger);';

        if (request.isDryRun === true) {
            return response;
        }
        try {
            var result = eval(injected);
            if (!result) {
                result = response;
            }
            var messageType = originalRequest.body,
                requestType = isCheck(messageType),
                xpath = require('xpath'),
                dom = require('xmldom').DOMParser,
                xml = originalRequest.body,
                parseJson = require('parse-json'),
                JSONPath = require('jsonpath-plus'),
                jsonReq = originalRequest.body,
                appBody = result.body,
                cleanResponse = appBody,
                title;

            for (var key in fn) {
                var index = '#{' + key + '}';
                if (cleanResponse.includes(index)) {
                    if (requestType.localeCompare('XML') === 0) {
                        var doc = new dom().parseFromString(xml);
                        title = xpath.select(fn[key], doc).toString();
                    }
                    else if (requestType.localeCompare('JSON') === 0) {
                        var jsonDoc = parseJson(jsonReq);
                        title = JSONPath(fn[key], jsonDoc).toString();
                    }
                    var initialIndex = 0;
                    do {
                        cleanResponse = cleanResponse.replace(index, title);
                    } while ((initialIndex = cleanResponse.indexOf(index, initialIndex + 1)) > -1);
                }
                else {
                    console.log("Couldn't Find: " + index + ' at loop : ' + key);
                }
            }
            result.body = cleanResponse;

            return Q(result);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid copyfrom injection', { source: injected, data: error.message }));
        }
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
    var result = Q(response);

    if (!behaviors) {
        return result;
    }

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    if (behaviors.wait) {
        result = wait(request, response, result, behaviors.wait, logger);
    }
    if (behaviors.shellTransform) {
        result = shellTransform(request, result, behaviors.shellTransform, logger);
    }
    if (behaviors.decorate) {
        result = decorate(request, result, behaviors.decorate, logger);
    }
    if (behaviors.copyFrom) {
        result = copyFrom(request, result, behaviors.copyFrom, logger);
    }

    return result;
}

module.exports = {
    wait: wait,
    decorate: decorate,
    shellTransform: shellTransform,
    copyFrom: copyFrom,
    execute: execute
};
