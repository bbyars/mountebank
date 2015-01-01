'use strict';

var Q = require('q');

function wait (response, milliseconds) {
    return response.delay(milliseconds);
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

    return result;
}

module.exports = {
    wait: wait,
    execute: execute
};
