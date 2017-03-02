'use strict';

/** @module */

function wrap (wrappedLogger, logger) {
    ['debug', 'info', 'warn', 'error'].forEach(function (level) {
        wrappedLogger[level] = function () {
            var args = Array.prototype.slice.call(arguments);
            args[0] = wrappedLogger.scopePrefix + args[0];
            logger[level].apply(logger, args);
        };
    });
}

/**
 * Returns a logger that prefixes each message of the given logger with a given scope
 * @param {Object} logger - The logger to add a scope to
 * @param {string} scope - The prefix for all log messages
 * @returns {Object}
 */
function create (logger, scope) {
    function formatScope (scopeText) {
        return scopeText.indexOf('[') === 0 ? scopeText : '[' + scopeText + '] ';
    }

    var inherit = require('./inherit'),
        wrappedLogger = inherit.from(logger, {
            scopePrefix: formatScope(scope),
            withScope: function (nestedScopePrefix) {
                return create(logger, wrappedLogger.scopePrefix + nestedScopePrefix + ' ');
            },
            changeScope: function (newScope) {
                wrappedLogger.scopePrefix = formatScope(newScope);
                wrap(wrappedLogger, logger);
            }
        });

    wrap(wrappedLogger, logger);
    return wrappedLogger;
}

module.exports = {
    create: create
};
