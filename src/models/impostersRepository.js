'use strict';

/**
 * An factory abstraction for loading imposters
 * @module
 */

/**
 * Creates the repository based on startup configuration
 * @param {Object} config - The startup configuration
 * @returns {Object} - the repository
 */
function create (config) {
    if (config.datadir) {
        return require('./filesystemBackedImposterRepository').create(config);
    }
    else {
        return require('./inMemoryImpostersRepository').create(config.imposters);
    }
}

module.exports = { create };
