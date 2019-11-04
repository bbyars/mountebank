'use strict';

/**
 * An abstraction for loading imposters from either in-memory or the filesystem.
 * @module
 */

function create (config) {
    const imposters = config.imposters || {};

    function add (imposter) {
        imposters[imposter.port] = imposter;
    }

    function getAllJSON (queryOptions) {
        return Object.keys(imposters).reduce((accumulator, id) =>
            accumulator.concat(imposters[id].toJSON(queryOptions)), []);
    }

    function get (id) {
        return imposters[id];
    }

    function getAll () {
        return imposters;
    }

    function exists (id) {
        return typeof get(id) !== 'undefined';
    }

    function del (id) {
        const result = get(id);
        delete imposters[id];
        return result.stop();
    }

    function deleteAllSync () {
        Object.keys(imposters).forEach(id => { imposters[id].stop(); });
    }

    function deleteAll () {
        const Q = require('q'),
            ids = Object.keys(imposters),
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
