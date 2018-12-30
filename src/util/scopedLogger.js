'use strict';

/** @module */

function wrap (wrappedLogger, logger) {
    ['debug', 'info', 'warn', 'error'].forEach(level => {
        wrappedLogger[level] = function () {
            const args = Array.prototype.slice.call(arguments);
            args[0] = wrappedLogger.scopePrefix + args[0];

            // Format here rather than use winston's splat formatter
            // to get rid of inconsistent "meta" log elements
            const message = require('util').format.apply(null, args);
            logger[level](message);
        };
    });
    wrappedLogger.baseLogger = logger;
}

/**
 * Returns a logger that prefixes each message of the given logger with a given scope
 * @param {Object} logger - The logger to add a scope to
 * @param {string} scope - The prefix for all log messages
 * @returns {Object}
 */
function create (logger, scope) {
    function formatScope (scopeText) {
        return scopeText.indexOf('[') === 0 ? scopeText : `[${scopeText}] `;
    }

    const inherit = require('./inherit'),
        wrappedLogger = inherit.from(logger, {
            scopePrefix: formatScope(scope),
            withScope: nestedScopePrefix => create(logger, `${wrappedLogger.scopePrefix}${nestedScopePrefix} `),
            changeScope: newScope => {
                wrappedLogger.scopePrefix = formatScope(newScope);
                wrap(wrappedLogger, logger);
            }
        });

    wrap(wrappedLogger, logger);
    return wrappedLogger;
}

module.exports = { create };
