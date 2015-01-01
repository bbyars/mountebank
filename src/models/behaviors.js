'use strict';

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q');

function wait (response, milliseconds) {
    return response.delay(milliseconds);
}

function decorate (request, responsePromise, fn, logger) {
    return responsePromise.then(function (response) {
        /* jshint evil: true */
        var scope = helpers.clone(request),
            injected = '(' + fn + ')(scope, response, logger);';

        try {
            // support returning a value
            eval(injected);
            return Q(response);
        }
        catch (error) {
            logger.error("injection X=> " + error);
            logger.error("    full source: " + JSON.stringify(injected));
            logger.error("    request: " + JSON.stringify(scope));
            logger.error("    response: " + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid response injection', { source: injected, data: error.message }));
        }
    });
}

function execute (response, behaviors, logger) {
    var result = Q(response);

    if (!behaviors) {
        return result;
    }

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    if (behaviors.wait) {
        result = wait(result, behaviors.wait);
    }
    if (behaviors.decorate) {
        result = decorate({}, result, behaviors.decorate, logger);
    }

    return result;
}

module.exports = {
    wait: wait,
    decorate: decorate,
    execute: execute
};
