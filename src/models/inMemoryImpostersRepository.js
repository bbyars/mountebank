'use strict';

/**
 * An abstraction for loading imposters from in-memory
 * @module
 */

/**
 * Creates the repository
 * @param {Object} startupImposters - The imposters to load at startup (will not be validated)
 * @returns {Object}
 */
function create (startupImposters) {
    const imposters = startupImposters || {},
        Q = require('q');

    /**
     * Adds a new imposter
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    function add (imposter) {
        imposters[imposter.port] = imposter;
        return Q(imposter);
    }

    /**
     * Gets the imposter by id
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the imposter
     */
    function get (id) {
        return Q(imposters[id] || null);
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function getAll () {
        return Q(imposters);
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return Q(typeof imposters[id] !== 'undefined');
    }

    /**
     * Deletes the imnposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        const result = imposters[id];
        delete imposters[id];
        return result.stop();
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     */
    function deleteAllSync () {
        Object.keys(imposters).forEach(id => { imposters[id].stop(); });
    }

    /**
     * Deletes all imposters
     * @returns {Object} - the deletion promise
     */
    function deleteAll () {
        const ids = Object.keys(imposters),
            promises = ids.map(id => imposters[id].stop());

        ids.forEach(id => { delete imposters[id]; });
        return Q.all(promises);
    }

    return {
        add,
        get,
        getAll,
        exists,
        del,
        deleteAllSync,
        deleteAll
    };
}

module.exports = { create };
