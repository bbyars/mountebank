'use strict';

var util = require('util'),
    assert = require('assert');

function create () {
    var logger = { calls: {} };

    ['debug', 'info', 'warn', 'error'].forEach(function (level) {
        logger.calls[level] = [];
        logger[level] = function () {
            logger.calls[level].push(util.format.apply(logger, arguments));
        };
        logger[level].assertLogged = function (message) {
            assert.ok(logger.calls[level].indexOf(message) >= 0, JSON.stringify(logger.calls, null, 4));
        }
    });

    return logger;
}

module.exports = {
    create: create
};
