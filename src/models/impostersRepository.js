'use strict';

/**
 * An factory abstraction for loading imposters
 * @module
 */

/**
 * Creates the repository based on startup configuration
 * @param {Object} config - The startup configuration
 * @param {Object} logger - The logger
 * @returns {Object} - the repository
 */
function create (config, logger) {
    if (config.datadir) {
        return require('./filesystemBackedImpostersRepository').create(config, logger);
    }
    else {
        return require('./inMemoryImpostersRepository').create();
    }
}

module.exports = { create };
