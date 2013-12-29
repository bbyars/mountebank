'use strict';

var util = require('util');

function create (logger, protocol, port) {
    var scopePrefix = util.format('[%s:%s] ', protocol, port),
        wrappedLogger = {};

    ['debug', 'info', 'warn', 'error'].forEach(function (level) {
        wrappedLogger[level] = function () {
            var args = Array.prototype.slice.call(arguments);
            args[0] = scopePrefix + args[0];
            logger[level].apply(logger, args);
        };
    });

    return wrappedLogger;
}

module.exports = {
    create: create
};
