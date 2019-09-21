'use strict';

/** @module */

interface ILogger {
    baseLogger:ILogger;
    [key:string]:Function|ILogger;
    (message:string):void;
}

function wrap (wrappedLogger:ILogger, logger:ILogger) {
    ['debug', 'info', 'warn', 'error'].forEach(level => {
        wrappedLogger[level] = function (...args:unknown[]) {
            args[0] = wrappedLogger.scopePrefix + (args[0] as any);

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
export function create (logger:ILogger, scope:string) {
    function formatScope (scopeText:string) {
        return scopeText.indexOf('[') === 0 ? scopeText : `[${scopeText}] `;
    }

    const inherit = require('./inherit'),
        wrappedLogger = inherit.from(logger, {
            scopePrefix: formatScope(scope),
            withScope: (nestedScopePrefix:string) => create(logger, `${wrappedLogger.scopePrefix}${nestedScopePrefix} `),
            changeScope: (newScope:string) => {
                wrappedLogger.scopePrefix = formatScope(newScope);
                wrap(wrappedLogger, logger);
            }
        });

    wrap(wrappedLogger, logger);
    return wrappedLogger;
}
