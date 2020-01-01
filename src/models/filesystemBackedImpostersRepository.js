'use strict';

/**
 * An abstraction for loading imposters from the filesystem
 * The root of the database is provided on the command line as --datadir
 * The file layout looks like this:
 *
 * /{datadir}
 *   /3000
 *     /imposter.json
 *       {
 *         "protocol": "http",
 *         "port": 3000,
 *         "stubs: [{
 *           "predicates": [{ "equals": { "path": "/" } }],
 *           "meta": {
 *             "dir": "stubs/0"
 *           }
 *         }]
 *       }
 *
 *     /stubs
 *       /0
 *         /meta.json
 *           {
 *             "responseFiles": ["responses/0.json"],
 *               // An array of indexes into responseFiles which handle repeat behavior
 *             "orderWithRepeats": [0],
 *               // The next index into orderWithRepeats; incremented with each call to nextResponse()
 *             "nextIndex": 0
 *           }
 *
 *         /responses
 *           /0.json
 *             {
 *               "is": { "body": "Hello, world!" }
 *             }
 *
 *         /matches
 *           /{timestamp}.json
 *             {
 *               { "request": { ... } },
 *               { "response": { ... } }
 *             }
 *
 *     /requests
 *       /{timestamp}.json
 *         { ... }
 *
 * This structure is designed to improve parallelism and throughput
 * The imposters.json file needs to be locked during imposter-level activities (e.g. adding a stub)
 * The stub meta.json needs to be locked to add responses or trigger the next response, but is
 * separated from the imposter.json so we can have responses from multiple stubs in parallel with no
 * lock conflict. The matches and requests use timestamp-based filenames to avoid having to lock any
 * file to update an index.
 * Keeping all imposter information under a directory (instead of having metadata outside the directory)
 * allows us to remove the imposter by simply removing the directory.
 *
 * @module
 */

function writeFile (filepath, obj) {
    const fs = require('fs-extra'),
        path = require('path'),
        Q = require('q'),
        dir = path.dirname(filepath),
        deferred = Q.defer();

    fs.ensureDir(dir, mkdirErr => {
        if (mkdirErr) {
            deferred.reject(mkdirErr);
        }
        else {
            fs.writeFile(filepath, JSON.stringify(obj, null, 2), err => {
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
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs');

    fs.readFile(filepath, 'utf8', (err, data) => {
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

function remove (path) {
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs-extra');

    fs.remove(path, err => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve({});
        }
    });

    return deferred.promise;
}

function repeatsFor (response) {
    if (response._behaviors && response._behaviors.repeat) {
        return response._behaviors.repeat;
    }
    else {
        return 1;
    }
}

function stubRepository (imposterDir) {
    const headerFile = `${imposterDir}/imposter.json`;

    function readHeader () {
        return readFile(headerFile).then(imposter => {
            // Due to historical design decisions when everything was in memory, stubs are actually
            // added (in imposter.js) _before_ the imposter is added (in impostersController.js). This
            // means that the stubs repository needs to gracefully handle the case where the header file
            // does not yet exist
            const result = imposter === null ? {} : imposter;
            result.stubs = result.stubs || [];
            return result;
        });
    }

    function next (paths, template) {
        if (paths.length === 0) {
            return template.replace('${index}', 0);
        }

        const numbers = paths.map(file => parseInt(file.match(/\d+/)[0])),
            max = Math.max(...numbers);

        return template.replace('${index}', max + 1);
    }

    function wrap (stub, index) {
        const Response = require('./response'),
            Q = require('q');

        if (typeof stub === 'undefined') {
            return {
                addResponse: () => Q(),
                deleteResponsesMatching: () => Q(),
                nextResponse: () => Q(Response.create())
            };
        }

        const helpers = require('../util/helpers'),
            cloned = helpers.clone(stub);

        delete cloned.meta;

        /**
         * Adds a response to the stub
         * @param {Object} response - the new response
         * @returns {Object} - the promise
         */
        cloned.addResponse = response => {
            return readHeader().then(imposter => {
                const promises = [],
                    saved = imposter.stubs[index],
                    responseFile = next(saved.meta.responseFiles, 'responses/${index}.json'),
                    responseIndex = saved.meta.responseFiles.length;

                saved.meta.responseFiles.push(responseFile);
                for (let repeats = 0; repeats < repeatsFor(response); repeats += 1) {
                    saved.meta.orderWithRepeats.push(responseIndex);
                }

                promises.push(writeFile(`${imposterDir}/${saved.meta.dir}/${responseFile}`, response));
                promises.push(writeFile(headerFile, imposter));
                return Q.all(promises);
            });
        };

        /**
         * Deletes all responses matching the filter
         * @param {Function} filter - the filter function
         * @returns {Object} - the promise
         */
        cloned.deleteResponsesMatching = filter => {
            return readHeader().then(imposter => {
                const savedStub = imposter.stubs[index].meta,
                    stubDir = `${imposterDir}/${savedStub.dir}`,
                    loadPromises = savedStub.responseFiles.map(file => readFile(`${stubDir}/${file}`));

                return Q.all(loadPromises).then(responses => {
                    const deletes = [];

                    for (let i = responses.length - 1; i >= 0; i -= 1) {
                        if (filter(responses[i])) {
                            deletes.push(remove(`${stubDir}/${savedStub.responseFiles[i]}`));
                            savedStub.responseFiles.splice(i, 1);
                            savedStub.orderWithRepeats = savedStub.orderWithRepeats
                                .filter(responseIndex => responseIndex !== i)
                                .map(responseIndex => {
                                    if (responseIndex > i) {
                                        return responseIndex - 1;
                                    }
                                    else {
                                        return responseIndex;
                                    }
                                });
                        }
                    }

                    if (deletes.length > 0) {
                        deletes.push(writeFile(headerFile, imposter));
                        return Q.all(deletes);
                    }
                    else {
                        return Q(true);
                    }
                });
            });
        };

        /**
         * Returns the next response for the stub, taking into consideration repeat behavior and cycling back the beginning
         * @returns {Object} - the promise
         */
        cloned.nextResponse = () => {
            return readHeader().then(imposter => {
                const meta = imposter.stubs[index].meta,
                    stubDir = `${imposterDir}/${meta.dir}`,
                    maxIndex = meta.orderWithRepeats.length,
                    responseIndex = meta.orderWithRepeats[meta.nextIndex % maxIndex],
                    responseFile = meta.responseFiles[responseIndex];

                meta.nextIndex = (meta.nextIndex + 1) % maxIndex;
                return Q.all([readFile(`${stubDir}/${responseFile}`), writeFile(headerFile, imposter)]);
            }).then(results => Response.create(results[0]));
        };

        return cloned;
    }

    /**
     * Returns the number of stubs for the imposter
     * @returns {Object} - the promise
     */
    function count () {
        return readHeader().then(imposter => imposter.stubs.length);
    }

    /**
     * Returns the first stub whose predicates matches the filter
     * @param {Function} filter - the filter function
     * @param {Number} startIndex - the index to to start searching
     * @returns {Object} - the promise
     */
    function first (filter, startIndex = 0) {
        return readHeader().then(imposter => {
            for (let i = startIndex; i < imposter.stubs.length; i += 1) {
                if (filter(imposter.stubs[i].predicates || [])) {
                    return { success: true, index: i, stub: wrap(imposter.stubs[i], i) };
                }
            }
            return { success: false, index: -1, stub: wrap() };
        });
    }

    /**
     * Adds a new stub to imposter
     * @param {Object} stub - the stub to add
     * @returns {Object} - the promise
     */
    function add (stub) {
        return insertAtIndex(stub, 99999999);
    }

    /**
     * Inserts a new stub at the given index
     * @param {Object} stub - the stub to add
     * @param {Number} index - the index to insert the new stub at
     * @returns {Object} - the promise
     */
    function insertAtIndex (stub, index) {
        const stubDefinition = {
                predicates: stub.predicates || [],
                meta: {
                    dir: '',
                    responseFiles: [],
                    orderWithRepeats: [],
                    nextIndex: 0
                }
            },
            responses = stub.responses || [],
            Q = require('q'),
            promises = [];

        return readHeader().then(imposter => {
            stubDefinition.meta.dir = next(imposter.stubs.map(saved => saved.meta.dir), 'stubs/${index}');

            for (let i = 0; i < responses.length; i += 1) {
                const responseFile = `responses/${i}.json`;
                stubDefinition.meta.responseFiles.push(responseFile);

                for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                    stubDefinition.meta.orderWithRepeats.push(i);
                }

                promises.push(writeFile(`${imposterDir}/${stubDefinition.meta.dir}/${responseFile}`, responses[i]));
            }

            imposter.stubs.splice(index, 0, stubDefinition);
            promises.push(writeFile(headerFile, imposter));
            return Q.all(promises);
        });
    }

    /**
     * Deletes the stub at the given index
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    function deleteAtIndex (index) {
        return readHeader().then(imposter => {
            const errors = require('../util/errors'),
                Q = require('q'),
                promises = [];

            if (typeof imposter.stubs[index] === 'undefined') {
                return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
            }

            promises.push(remove(`${imposterDir}/${imposter.stubs[index].meta.dir}`));
            imposter.stubs.splice(index, 1);
            promises.push(writeFile(headerFile, imposter));
            return Q.all(promises);
        });
    }

    /**
     * Overwrites all stubs with a new list
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    function overwriteAll (newStubs) {
        const Q = require('q');

        return readHeader().then(imposter => {
            const deletePromises = [];
            imposter.stubs = [];
            deletePromises.push(remove(`${imposterDir}/stubs`));
            deletePromises.push(writeFile(headerFile, imposter));
            return Q.all(deletePromises);
        }).then(() => {
            let addSequence = Q(true);
            newStubs.forEach(stub => {
                addSequence = addSequence.then(() => add(stub));
            });
            return addSequence;
        });
    }

    /**
     * Overwrites the stub at the given index
     * @param {Object} stub - the new stub
     * @param {Number} index - the index of the stub to overwrite
     * @returns {Object} - the promise
     */
    function overwriteAtIndex (stub, index) {
        return deleteAtIndex(index).then(() => insertAtIndex(stub, index));
    }

    /**
     * Returns all stubs
     * @returns {Object} - the promise resolving to the list of stubs
     */
    function all () {
        return readHeader().then(imposter => imposter.stubs.map(wrap));
    }

    function loadResponses (stub) {
        const Q = require('q');
        return Q.all(stub.meta.responseFiles.map(responseFile =>
            readFile(`${imposterDir}/${stub.meta.dir}/${responseFile}`)));
    }

    /**
     * Returns a JSON-convertible representation
     * @returns {Object} - the promise resolving to the JSON object
     */
    function toJSON () {
        return readHeader().then(header => {
            const Q = require('q'),
                loadPromises = header.stubs.map(loadResponses);

            return Q.all(loadPromises).then(stubResponses => {
                header.stubs.forEach((stub, index) => {
                    stub.responses = stubResponses[index];
                    delete stub.meta;
                });
                return header.stubs;
            });
        });
    }

    return {
        count,
        first,
        add,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        all,
        toJSON
    };
}

/**
 * Creates the repository
 * @param {Object} config - The database configuration
 * @param {String} config.datadir - The database directory
 * @returns {Object}
 */
function create (config) {
    const Q = require('q'),
        imposters = {};

    function writeHeader (imposter) {
        return writeFile(`${config.datadir}/${imposter.port}/imposter.json`, imposter);
    }

    function readHeader (id) {
        return readFile(`${config.datadir}/${id}/imposter.json`);
    }

    function deleteHeader (id) {
        const fs = require('fs-extra'),
            deferred = Q.defer();

        fs.remove(`${config.datadir}/${id}/imposter.json`, err => {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    function readResponses (responseDir) {
        let responses = [];

        return readFile(`${config.datadir}/${responseDir}/index.json`).then(index => {
            if (index === null) {
                return Q(true);
            }
            else {
                responses = Array(index.order.length);
                const promises = index.order.map(responseIndex =>
                    readFile(`${config.datadir}/${responseDir}/${responseIndex}.json`).then(response => {
                        responses.splice(responseIndex, 1, response);
                    })
                );

                return Q.all(promises);
            }
        }).then(() => Q(responses));
    }

    function readStubs (id) {
        let stubs;
        return readFile(`${config.datadir}/${id}/stubs/0-99.json`).then(stubsWithoutResponses => {
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
        return remove(`${config.datadir}/${id}`);
    }
    /**
     * Adds a new imposter
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    function add (imposter) {
        // Due to historical design decisions when everything was in memory, stubs are actually
        // added (in imposter.js) _before_ the imposter is added (in impostersController.js). This
        // means that the header file may already exist (or not, if the imposter has no stubs).
        return readHeader(imposter.port).then(header => {
            if (header === null) {
                header = { stubs: [] };
            }

            const helpers = require('../util/helpers'),
                cloned = helpers.clone(imposter);
            cloned.stubs = header.stubs;
            delete cloned.requests;
            return writeHeader(cloned).then(() => {
                const id = String(imposter.port);
                imposters[id] = { stop: imposter.stop };
                return imposter;
            });
        });
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
            return imposter;
        });
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function all () {
        const fs = require('fs'),
            allImposters = {},
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
                        .filter(filename => filename)
                        .map(filename => filename.replace('.json', '')),
                    promises = ids.map(id => get(id).then(imposter => { allImposters[id] = imposter; }));

                Q.all(promises).done(() => { deferred.resolve(allImposters); });
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
        return Q(Object.keys(imposters).indexOf(String(id)) >= 0);
    }

    function shutdown (id) {
        const fn = imposters[String(id)].stop;
        delete imposters[String(id)];
        return fn ? fn() : Q();
    }
    /**
     * Deletes the imnposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        return get(id).then(imposter => {
            const promises = imposter ? [deleteHeader(id), deleteStubs(id), shutdown(id)] : [];
            return Q.all(promises).then(() => imposter);
        });
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     */
    function deleteAllSync () {
        const fs = require('fs-extra');
        fs.removeSync(config.datadir);
        Object.keys(imposters).forEach(shutdown);
    }

    /**
     * Deletes all imposters
     * @returns {Object} - the deletion promise
     */
    function deleteAll () {
        const promises = Object.keys(imposters).map(shutdown);
        promises.push(remove(config.datadir));
        return Q.all(promises);
    }

    return {
        add,
        get,
        all,
        exists,
        del,
        deleteAllSync,
        deleteAll,
        stubsFor: id => stubRepository(`${config.datadir}/${id}`)
    };
}

module.exports = { create };
