'use strict';

var inherit = require('./inherit');

function create (logger, scope) {
    var scopePrefix = scope.indexOf('[') === 0 ? scope : '[' + scope + '] ',
        wrappedLogger = inherit.from(logger, {
            withScope: function (nestedScopePrefix) {
                return create(logger, scopePrefix + nestedScopePrefix + ' ');
            }
        });

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
