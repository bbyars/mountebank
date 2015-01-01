'use strict';

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q');

function wait (responsePromise, milliseconds) {
    return responsePromise.delay(milliseconds);
}

function decorate (originalRequest, responsePromise, fn, logger) {
    return responsePromise.then(function (response) {
        /* jshint evil: true */
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
            logger.error("injection X=> " + error);
            logger.error("    full source: " + JSON.stringify(injected));
            logger.error("    request: " + JSON.stringify(request));
            logger.error("    response: " + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
        }
    });
}

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
