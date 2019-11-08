'use strict';

/**
 * An abstraction for loading imposters from in-memory
 * @module
 */

/**
 * Creates the repository
 * @param {Object} config - The database configuration
 * @param {String} config.datadir - The database directory
 * @param {Number} config.batchSize - number of stubs to save in one file, defaults to 100
 * @returns {Object}
 */
function create (config) {
    const Q = require('q');

    function writeFile (filepath, obj) {
        const fs = require('fs-extra'),
            path = require('path'),
            fullPath = path.join(config.datadir, filepath),
            dir = path.dirname(fullPath),
            deferred = Q.defer();

        fs.ensureDir(dir, mkdirErr => {
            if (mkdirErr) {
                deferred.reject(mkdirErr);
            }
            else {
                fs.writeFile(fullPath, JSON.stringify(obj), err => {
                    if (err) {
                        deferred.reject(err);
                    }
                    else {
                        deferred.resolve(filepath);
                    }
                });
            }
        });

        return deferred.promise;
    }

    function readFile (filepath) {
        const deferred = Q.defer(),
            path = require('path'),
            fullPath = path.join(config.datadir, filepath),
            fs = require('fs');

        fs.readFile(fullPath, 'utf8', (err, data) => {
            if (err && err.code === 'ENOENT') {
                deferred.resolve(null);
            }
            else if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(JSON.parse(data));
            }
        });

        return deferred.promise;
    }

    function writeHeader (imposter) {
        const helpers = require('../util/helpers'),
            clone = helpers.clone(imposter);

        delete clone.stubs;
        delete clone.requests;

        return writeFile(`${imposter.port}.json`, clone);
    }

    function readHeader (id) {
        return readFile(`${id}.json`);
    }

    function deleteHeader (id) {
        const fs = require('fs-extra'),
            deferred = Q.defer();

        fs.remove(`${config.datadir}/${id}.json`, err => {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    function writeResponses (responseDir, stubResponses) {
        const responsesIndex = { next: 0, order: [] },
            promises = [];

        if (stubResponses.length === 0) {
            return Q(true);
        }

        stubResponses.forEach((response, index) => {
            promises.push(writeFile(`${responseDir}/${index}.json`, response));
            responsesIndex.order.push(index);
        });

        promises.push(writeFile(`${responseDir}/index.json`, responsesIndex));
        return Q.all(promises);
    }

    function readResponses (responseDir) {
        let responses = [];

        return readFile(`${responseDir}/index.json`).then(index => {
            if (index === null) {
                return Q(true);
            }
            else {
                responses = Array(index.order.length);
                const promises = index.order.map(responseIndex =>
                    readFile(`${responseDir}/${responseIndex}.json`).then(response => {
                        responses.splice(responseIndex, 1, response);
                    })
                );

                return Q.all(promises);
            }
        }).then(() => Q(responses));
    }

    function writeStubs (imposter) {
        const helpers = require('../util/helpers'),
            stubs = helpers.clone(imposter.stubs || []),
            promises = [];

        if (stubs.length === 0) {
            return Q(true);
        }

        stubs.forEach((stub, index) => {
            stub.responseDir = `${imposter.port}/stubs/${index}`;
            promises.push(writeResponses(stub.responseDir, stub.responses || []));
            delete stub.responses;
        });

        promises.push(writeFile(`${imposter.port}/stubs/0-99.json`, stubs));
        return Q.all(promises);
    }

    function readStubs (id) {
        let stubs;
        return readFile(`${id}/stubs/0-99.json`).then(stubsWithoutResponses => {
            if (stubsWithoutResponses === null) {
                stubs = [];
                return Q(true);
            }
            else {
                stubs = stubsWithoutResponses;
                const promises = [];
                stubs.forEach(stub => {
                    const promise = readResponses(stub.responseDir).then(responses => {
                        stub.responses = responses;
                        delete stub.responseDir;
                    });
                    promises.push(promise);
                });
                return Q.all(promises);
            }
        }).then(() => Q(stubs));
    }

    function deleteStubs (id) {
        const fs = require('fs-extra'),
            deferred = Q.defer();

        fs.remove(`${config.datadir}/${id}`, err => {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    }
    /**
     * Adds a new imposter
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    function add (imposter) {
        return Q.all([writeHeader(imposter), writeStubs(imposter)]).then(() => Q(imposter));
    }

    /**
     * Gets the imposter by id
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the promise resolving to the imposter
     */
    function get (id) {
        let imposter;
        return readHeader(id).then(header => {
            imposter = header;
            return imposter === null ? Q(true) : readStubs(id);
        }).then(stubs => {
            if (imposter !== null) {
                imposter.stubs = stubs;
            }
            return Q(imposter);
        });
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function getAll () {
        const fs = require('fs'),
            imposters = {},
            deferred = Q.defer();

        fs.readdir(config.datadir, (err, files) => {
            if (err && err.code === 'ENOENT') {
                // Nothing saved yet
                deferred.resolve({});
            }
            else if (err) {
                deferred.reject(err);
            }
            else {
                const ids = files
                        .filter(filename => filename.indexOf('.json') > 0)
                        .map(filename => filename.replace('.json', '')),
                    promises = ids.map(id => get(id).then(imposter => { imposters[id] = imposter; }));

                Q.all(promises).done(() => { deferred.resolve(imposters); });
            }
        });
        return deferred.promise;
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return readHeader(id).then(header => Q(header !== null));
    }

    /**
     * Deletes the imnposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        return get(id).then(imposter =>
            Q.all([deleteHeader(id), deleteStubs(id)]).then(() => Q(imposter))
        );
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     */
    function deleteAllSync () {
    }

    /**
     * Deletes all imposters
     * @returns {Object} - the deletion promise
     */
    function deleteAll () {
        return null;
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
