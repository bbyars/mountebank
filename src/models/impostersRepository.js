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
        imposters,
        add,
        getAllJSON,
        deleteAllSync,
        deleteAll
    };
}

module.exports = { create };
