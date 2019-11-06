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
     * Gets the JSON for all imposters
     * @param {Object} queryOptions - the query parameters for formatting
     * @returns {Object} - the JSON representation
     */
    function getAllJSON (queryOptions) {
        return Object.keys(imposters).reduce((accumulator, id) =>
            accumulator.concat(imposters[id].toJSON(queryOptions)), []);
    }

    /**
     * Gets the imposter by id
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the imposter
     */
    function get (id) {
        return imposters[id];
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function getAll () {
        return imposters;
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return typeof get(id) !== 'undefined';
    }

    /**
     * Deletes the imnposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        const result = get(id);
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
        getAllJSON,
        exists,
        del,
        deleteAllSync,
        deleteAll
    };
}

module.exports = { create };
