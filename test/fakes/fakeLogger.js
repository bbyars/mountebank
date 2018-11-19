'use strict';

const util = require('util'),
    assert = require('assert');

function create () {
    const logger = { calls: {} };
    logger.toString = function () { return JSON.stringify(logger.calls, null, 4); };


    ['debug', 'info', 'warn', 'error'].forEach(function (level) {
        logger.calls[level] = [];
        logger[level] = function () {
            logger.calls[level].push(util.format.apply(logger, arguments));
        };
        logger[level].assertLogged = message => {
            assert.ok(logger.calls[level].some(function (entry) {
                return entry.indexOf(message) >= 0;
            }), JSON.stringify(logger.calls, null, 4));
        };
    });

    return logger;
}

module.exports = {
    create
};
