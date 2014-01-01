'use strict';

var util = require('util');

function create (logger, scopePrefix) {
    var wrappedLogger = {
        level: logger.level
    };

    ['debug', 'info', 'warn', 'error'].forEach(function (level) {
        wrappedLogger[level] = function () {
            var args = Array.prototype.slice.call(arguments);
            args[0] = util.format('[%s] %s', scopePrefix, args[0]);
            logger[level].apply(logger, args);
        };
    });

    return wrappedLogger;
}

module.exports = {
    create: create
};
