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

    function ensureParentDirExists (filepath) {
        // Node 11 introduced a recursive flag for mkdir, can use that when node 10 and below are deprecated
        const path = require('path'),
            fs = require('fs'),
            deferred = Q.defer(),
            dir = path.dirname(filepath);

        fs.access(dir, fs.constants.F_OK, dirDoesNotExist => {
            if (dirDoesNotExist) {
                ensureParentDirExists(dir).done(() => {
                    fs.mkdir(dir, err => {
                        // Another request could have created it since the last check
                        if (err && err.code !== 'EEXIST') {
                            deferred.reject(err);
                        }
                        else {
                            deferred.resolve(dir);
                        }
                    });
                });
            }
            else {
                deferred.resolve(dir);
            }
        });

        return deferred.promise;
    }

    function writeFile (filepath, obj) {
        const fs = require('fs'),
            path = require('path'),
            fullPath = path.join(config.datadir, filepath),
            deferred = Q.defer();

        ensureParentDirExists(fullPath).done(() => {
            fs.writeFile(fullPath, JSON.stringify(obj), err => {
                if (err) {
                    deferred.reject(err);
                }
                else {
                    deferred.resolve(filepath);
                }
            });
        });

        return deferred.promise;
    }

    function readFile (filepath) {
        const deferred = Q.defer(),
            path = require('path'),
            fullPath = path.join(config.datadir, filepath),
            fs = require('fs');

        fs.readFile(fullPath, 'utf8', (err, data) => {
            if (err) {
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
        const responses = [],
            deferred = Q.defer();

        readFile(`${responseDir}/index.json`).then(index => {
            const promises = index.order.map(responseIndex =>
                readFile(`${responseDir}/${responseIndex}.json`).then(response => {
                    responses.splice(responseIndex, 1, response);
                })
            );

            return Q.all(promises);
        }).done(() => {
            deferred.resolve(responses);
        });

        return deferred.promise;
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
        const deferred = Q.defer();

        let stubs;
        readFile(`${id}/stubs/0-99.json`).then(stubsWithoutResponses => {
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
        }).done(() => {
            deferred.resolve(stubs);
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
        const deferred = Q.defer();

        let imposter;
        readHeader(id).then(header => {
            imposter = header;
            return readStubs(id);
        }).then(stubs => {
            imposter.stubs = stubs;
        }).done(() => deferred.resolve(imposter));

        return deferred.promise;
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function getAll () {
        return null;
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) { // eslint-disable-line no-unused-vars
        return false;
    }

    /**
     * Deletes the imnposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) { // eslint-disable-line no-unused-vars
        return null;
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
