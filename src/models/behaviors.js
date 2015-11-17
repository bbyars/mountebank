'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q');

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param responsePromise {Object} The promise returning the response
 * @param milliseconds {number} The number of milliseconds to wait before returning
 * @returns {Object} A promise resolving to the response
 */
function wait (responsePromise, milliseconds) {
    return responsePromise.delay(milliseconds);
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param originalRequest {object} The request object, in case post-processing depends on it
 * @param responsePromise {Object} The promise returning the response
 * @param fn {Function} The function that performs the post-processing
 * @param logger {Logger} The mountebank logger, useful in debugging
 * @returns {Object}
 */
function decorate (originalRequest, responsePromise, fn, logger) {
    return responsePromise.then(function (response) {
        var request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);';

        if (request.isDryRun === true) {
            return response;
        }
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

/**
 * The entry point to execute all behaviors provided in the API
 * @param request {object} The request object
 * @param response {object} The response generated from the stubs
 * @param behaviors {object} The behaviors specified in the API
 * @param logger {Logger} The mountebank logger, useful for debugging
 * @returns {Object}
 */
function execute (request, response, behaviors, logger) {
    var result = Q(response);

    if (!behaviors) {
        return result;
    }

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    if (behaviors.wait) {
        result = wait(result, behaviors.wait);
    }
    if (behaviors.decorate) {
        result = decorate(request, result, behaviors.decorate, logger);
    }

    return result;
}

module.exports = {
    wait: wait,
    decorate: decorate,
    execute: execute
};
