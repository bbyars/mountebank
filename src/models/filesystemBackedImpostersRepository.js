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
 *             "dir": "stubs/{epoch-pid-counter}"
 *           }
 *         }]
 *       }
 *
 *     /stubs
 *       /{epoch-pid-counter}
 *         /meta.json
 *           {
 *             "responseFiles": ["responses/{epoch-pid-counter}.json"],
 *               // An array of indexes into responseFiles which handle repeat behavior
 *             "orderWithRepeats": [0],
 *               // The next index into orderWithRepeats; incremented with each call to nextResponse()
 *             "nextIndex": 0
 *           }
 *
 *         /responses
 *           /{epoch-pid-counter}.json
 *             {
 *               "is": { "body": "Hello, world!" }
 *             }
 *
 *         /matches
 *             /{epoch-pid-counter}.json
 *                 { ... }
 *
 *     /requests
 *       /{epoch-pid-counter}.json
 *         { ... }
 *
 * This structure is designed to minimize the amount of file locking and to maximize parallelism and throughput.
 *
 * The imposters.json file needs to be locked during imposter-level activities (e.g. adding a stub).
 * Readers do not lock; they just get the data at the time they read it. Since this file doesn't
 * contain transient state, there's no harm from a stale read. Writes (which happen for
 * stub changing operations, either for proxy response recording or stub API calls) grab a file lock
 * for both the read and the write. Writes to this file should be infrequent, except perhaps during
 * proxy recording. Newly added stubs may change the index of existing stubs in the stubs array, but
 * will never change the stub meta.dir, so it is always safe to hang on to it for subsequent operations.
 *
 * The stub meta.json needs to be locked to add responses or trigger the next response, but is
 * separated from the imposter.json so we can have responses from multiple stubs in parallel with no
 * lock conflict. Again, readers (e.g. to generate imposter JSON) do not need a lock because the responseFiles
 * array is mostly read-only, and even when it's not (adding responses during proxyAlways recording), there's
 * no harm from a stale read. Writers (usually generating the next response for a stub) grab a lock for the
 * read and the write. This should be the most common write across files, which is why the meta.json file
 * is small.
 *
 * In both cases where a file needs to be locked, an exponential backoff retry strategy is used. Inconsistent
 * reads of partially written files (which can happen by default with the system calls - fs.writeFile is not
 * atomic) are avoided by writing first to a temp file (during which time reads can happen to the original file)
 * and then renaming to the original file.
 *
 * New directories and filenames use a timestamp-based filename to allow creating them without synchronizing
 * with a read. Since multiple files (esp. requests) can be added during the same millisecond, a pid and counter
 * is tacked on to the filename to improve uniqueness. It doesn't provide the * ironclad guarantee a GUID
 * does -- two different processes on two different machines could in theory have the same pid and create files
 * during the same timestamp with the same counter, but the odds of that happening * are so small that it's not
 * worth giving up the easy time-based sortability based on filenames alone.
 *
 * Keeping all imposter information under a directory (instead of having metadata outside the directory)
 * allows us to remove the imposter by simply removing the directory.
 *
 * @module
 */

/**
 * Creates the repository
 * @param {Object} config - The database configuration
 * @param {String} config.datadir - The database directory
 * @param {Object} logger - The logger
 * @returns {Object}
 */
function create (config, logger) {
    let counter = 0,
        locks = 0;
    const Q = require('q'),
        imposterFns = {};

    function prettyError (err, filepath) {
        const errors = require('../util/errors');

        if (err.code === 'EACCES') {
            return errors.InsufficientAccessError({ path: filepath });
        }
        else {
            return err;
        }
    }

    function writeFile (filepath, obj) {
        const fs = require('fs-extra'),
            path = require('path'),
            dir = path.dirname(filepath),
            deferred = Q.defer();

        fs.ensureDir(dir, mkdirErr => {
            if (mkdirErr) {
                deferred.reject(prettyError(mkdirErr, dir));
            }
            else {
                fs.writeFile(filepath, JSON.stringify(obj, null, 2), err => {
                    if (err) {
                        deferred.reject(prettyError(err, filepath));
                    }
                    else {
                        deferred.resolve(filepath);
                    }
                });
            }
        });

        return deferred.promise;
    }

    function readFile (filepath, defaultContents) {
        const deferred = Q.defer(),
            fs = require('fs'),
            errors = require('../util/errors');

        fs.readFile(filepath, 'utf8', (err, data) => {
            if (err && err.code === 'ENOENT') {
                if (typeof defaultContents === 'undefined') {
                    logger.error(`Corrupted database: missing file ${filepath}`);
                    deferred.reject(errors.DatabaseError('file not found', { details: err.message }));
                }
                else {
                    deferred.resolve(defaultContents);
                }
            }
            else if (err) {
                deferred.reject(prettyError(err, filepath));
            }
            else {
                try {
                    deferred.resolve(JSON.parse(data));
                }
                catch (parseErr) {
                    logger.error(`Corrupted database: invalid JSON for ${filepath}`);
                    deferred.reject(errors.DatabaseError(`invalid JSON in ${filepath}`, { details: parseErr.message }));
                }
            }
        });

        return deferred.promise;
    }

    function rename (oldPath, newPath) {
        const deferred = Q.defer(),
            fs = require('fs');

        fs.rename(oldPath, newPath, err => {
            if (err) {
                deferred.reject(prettyError(err, oldPath));
            }
            else {
                deferred.resolve(newPath);
            }
        });

        return deferred.promise;
    }

    function ensureDir (filepath) {
        const fs = require('fs-extra'),
            path = require('path'),
            dir = path.dirname(filepath),
            deferred = Q.defer();

        fs.ensureDir(dir, err => {
            if (err) {
                deferred.reject(prettyError(err, dir));
            }
            else {
                deferred.resolve(dir);
            }
        });

        return deferred.promise;
    }

    function readAndWriteFile (filepath, caller, transformer, defaultContents) {
        const locker = require('proper-lockfile'),
            options = {
                realpath: false,
                retries: {
                    retries: 10,
                    factor: 1.47394, // https://www.wolframalpha.com/input/?i=Sum%5B50*x%5Ek%2C+%7Bk%2C+0%2C+9%7D%5D+%3D+5000
                    minTimeout: 50,
                    maxTimeout: 5000,
                    randomize: true
                }
            },
            tmpfile = filepath + '.tmp',
            currentLockId = locks,
            start = new Date();

        locks += 1;

        // with realpath = false, the file doesn't have to exist, but the directory does
        return ensureDir(filepath)
            .then(() => locker.lock(filepath, options))
            .then(release => {
                const lockStart = new Date(),
                    lockWait = lockStart - start;
                logger.debug(`Acquired file lock on ${filepath} for ${caller}-${currentLockId} after ${lockWait}ms`);

                return readFile(filepath, defaultContents)
                    .then(original => transformer(original))
                    .then(transformed => writeFile(tmpfile, transformed))
                    .then(() => rename(tmpfile, filepath))
                    .then(() => {
                        const lockHeld = new Date() - lockStart;
                        logger.debug(`Released file lock on ${filepath} for ${caller}-${currentLockId} after ${lockHeld}ms`);
                        return release();
                    });
            })
            .catch(err => {
                locker.unlock(filepath, { realpath: false }).catch(unlockErr => {
                    logger.error(`Failed to unlock ${filepath} for ${caller}-${currentLockId}: ${unlockErr}`);
                });
                return Q.reject(err);
            });
    }

    function remove (path) {
        const deferred = Q.defer(),
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

    function filenameFor (timestamp) {
        const epoch = timestamp.valueOf();
        counter += 1;
        return `${epoch}-${process.pid}-${counter}`;
    }

    function partsFrom (filename) {
        // format {epoch}-{pid}-{counter}
        const pattern = /^(\d+)-(\d+)-(\d+)\.json$/,
            parts = pattern.exec(filename);
        return {
            epoch: Number(parts[1]),
            pid: Number(parts[2]),
            counter: Number(parts[3])
        };
    }

    function timeSorter (first, second) {
        // format {epoch}-{pid}-{counter}
        // sort by epoch first, then pid, then counter to guarantee determinism for
        // files added during the same millisecond.
        const firstParts = partsFrom(first),
            secondParts = partsFrom(second);
        let result = firstParts.epoch - secondParts.epoch;
        if (result === 0) {
            result = firstParts.pid - secondParts.pid;
        }
        if (result === 0) {
            result = firstParts.counter - secondParts.counter;
        }
        return result;
    }

    function readdir (path) {
        const deferred = Q.defer(),
            fs = require('fs-extra');

        fs.readdir(path, (err, files) => {
            if (err && err.code === 'ENOENT') {
                // Nothing saved yet
                deferred.resolve([]);
            }
            else if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(files);
            }
        });
        return deferred.promise;
    }

    function loadAllInDir (path) {
        return readdir(path).then(files => {
            const promises = files
                .filter(file => file.indexOf('.json') > 0)
                .sort(timeSorter)
                .map(file => readFile(`${path}/${file}`));

            return Q.all(promises);
        });
    }

    function repeatsFor (response) {
        if (response._behaviors && response._behaviors.repeat) {
            return response._behaviors.repeat;
        }
        else {
            return 1;
        }
    }

    function saveStubMetaAndResponses (stub, baseDir) {
        const stubDefinition = {
                meta: { dir: `stubs/${filenameFor(new Date())}` }
            },
            meta = {
                responseFiles: [],
                orderWithRepeats: [],
                nextIndex: 0
            },
            responses = stub.responses || [],
            promises = [];

        if (stub.predicates) {
            stubDefinition.predicates = stub.predicates;
        }

        for (let i = 0; i < responses.length; i += 1) {
            const responseFile = `responses/${filenameFor(new Date())}.json`;
            meta.responseFiles.push(responseFile);

            for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                meta.orderWithRepeats.push(i);
            }

            promises.push(writeFile(`${baseDir}/${stubDefinition.meta.dir}/${responseFile}`, responses[i]));
        }

        promises.push(writeFile(`${baseDir}/${stubDefinition.meta.dir}/meta.json`, meta));
        return Q.all(promises).then(() => stubDefinition);
    }

    function stubRepository (baseDir) {
        const imposterFile = `${baseDir}/imposter.json`;

        function metaPath (stubDir) {
            return `${baseDir}/${stubDir}/meta.json`;
        }

        function responsePath (stubDir, responseFile) {
            return `${baseDir}/${stubDir}/${responseFile}`;
        }

        function requestPath (request) {
            return `${baseDir}/requests/${filenameFor(Date.parse(request.timestamp))}.json`;
        }

        function matchPath (stubDir, match) {
            return `${baseDir}/${stubDir}/matches/${filenameFor(Date.parse(match.timestamp))}.json`;
        }

        function readHeader () {
            return readFile(imposterFile, { stubs: [] });
        }

        function readAndWriteHeader (caller, transformer) {
            return readAndWriteFile(imposterFile, caller, transformer, { stubs: [] });
        }

        function wrap (stub) {
            const helpers = require('../util/helpers'),
                cloned = helpers.clone(stub || {}),
                stubDir = stub ? stub.meta.dir : '';

            if (typeof stub === 'undefined') {
                return {
                    addResponse: () => Q(),
                    nextResponse: () => Q({
                        is: {},
                        stubIndex: () => Q(0)
                    }),
                    recordMatch: () => Q()
                };
            }

            delete cloned.meta;

            /**
             * Adds a response to the stub
             * @memberOf module:models/filesystemBackedImpostersRepository#
             * @param {Object} response - the new response
             * @returns {Object} - the promise
             */
            cloned.addResponse = response => {
                let responseFile;
                return readAndWriteFile(metaPath(stubDir), 'addResponse', meta => {
                    const responseIndex = meta.responseFiles.length;
                    responseFile = `responses/${filenameFor(new Date())}.json`;

                    meta.responseFiles.push(responseFile);
                    for (let repeats = 0; repeats < repeatsFor(response); repeats += 1) {
                        meta.orderWithRepeats.push(responseIndex);
                    }

                    return writeFile(responsePath(stubDir, responseFile), response).then(() => meta);
                });
            };

            function stubIndex () {
                return readHeader().then(header => {
                    for (let i = 0; i < header.stubs.length; i += 1) {
                        if (header.stubs[i].meta.dir === stubDir) {
                            return i;
                        }
                    }
                    return 0;
                });
            }

            function createResponse (responseConfig) {
                const result = helpers.clone(responseConfig || { is: {} });
                result.stubIndex = stubIndex;
                return result;
            }

            /**
             * Returns the next response for the stub, taking into consideration repeat behavior and cycling back the beginning
             * @memberOf module:models/filesystemBackedImpostersRepository#
             * @returns {Object} - the promise
             */
            cloned.nextResponse = () => {
                let responseFile;
                return readAndWriteFile(metaPath(stubDir), 'nextResponse', meta => {
                    const maxIndex = meta.orderWithRepeats.length,
                        responseIndex = meta.orderWithRepeats[meta.nextIndex % maxIndex];

                    responseFile = meta.responseFiles[responseIndex];

                    meta.nextIndex = (meta.nextIndex + 1) % maxIndex;
                    return Q(meta);
                }).then(() => readFile(responsePath(stubDir, responseFile)))
                    .then(responseConfig => createResponse(responseConfig));
            };

            /**
             * Records a match for debugging purposes
             * @memberOf module:models/filesystemBackedImpostersRepository#
             * @param {Object} request - the request
             * @param {Object} response - the response
             * @param {Object} responseConfig - the config that generated the response
             * @param {Number} processingTime - the time to match the predicate and generate the full response
             * @returns {Object} - the promise
             */
            cloned.recordMatch = (request, response, responseConfig, processingTime) => {
                const match = {
                    timestamp: new Date().toJSON(),
                    request,
                    response,
                    responseConfig,
                    processingTime
                };
                return writeFile(matchPath(stubDir, match), match);
            };

            return cloned;
        }

        /**
         * Returns the number of stubs for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - the promise
         */
        function count () {
            return readHeader().then(imposter => imposter.stubs.length);
        }

        /**
         * Returns the first stub whose predicates matches the filter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Function} filter - the filter function
         * @param {Number} startIndex - the index to to start searching
         * @returns {Object} - the promise
         */
        function first (filter, startIndex = 0) {
            return readHeader().then(header => {
                for (let i = startIndex; i < header.stubs.length; i += 1) {
                    if (filter(header.stubs[i].predicates || [])) {
                        return { success: true, stub: wrap(header.stubs[i]) };
                    }
                }
                return { success: false, stub: wrap() };
            });
        }

        /**
         * Adds a new stub to imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the stub to add
         * @returns {Object} - the promise
         */
        function add (stub) { // eslint-disable-line no-shadow
            return saveStubMetaAndResponses(stub, baseDir).then(stubDefinition => {
                return readAndWriteHeader('addStub', header => {
                    header.stubs.push(stubDefinition);
                    return header;
                });
            });
        }

        /**
         * Inserts a new stub at the given index
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the stub to add
         * @param {Number} index - the index to insert the new stub at
         * @returns {Object} - the promise
         */
        function insertAtIndex (stub, index) {
            return saveStubMetaAndResponses(stub, baseDir).then(stubDefinition => {
                return readAndWriteHeader('insertStubAtIndex', header => {
                    header.stubs.splice(index, 0, stubDefinition);
                    return header;
                });
            });
        }

        /**
         * Deletes the stub at the given index
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Number} index - the index of the stub to delete
         * @returns {Object} - the promise
         */
        function deleteAtIndex (index) {
            let stubDir;

            return readAndWriteHeader('deleteStubAtIndex', header => {
                const errors = require('../util/errors');

                if (typeof header.stubs[index] === 'undefined') {
                    return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
                }

                stubDir = header.stubs[index].meta.dir;
                header.stubs.splice(index, 1);
                return header;
            }).then(() => remove(`${baseDir}/${stubDir}`));
        }

        /**
         * Overwrites all stubs with a new list
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} newStubs - the new list of stubs
         * @returns {Object} - the promise
         */
        function overwriteAll (newStubs) {
            return readAndWriteHeader('overwriteAllStubs', header => {
                header.stubs = [];
                return remove(`${baseDir}/stubs`).then(() => header);
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
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the new stub
         * @param {Number} index - the index of the stub to overwrite
         * @returns {Object} - the promise
         */
        function overwriteAtIndex (stub, index) {
            return deleteAtIndex(index).then(() => insertAtIndex(stub, index));
        }

        function loadResponses (stub) {
            return readFile(metaPath(stub.meta.dir))
                .then(meta => Q.all(meta.responseFiles.map(responseFile =>
                    readFile(responsePath(stub.meta.dir, responseFile)))));
        }

        function loadMatches (stub) {
            return loadAllInDir(`${baseDir}/${stub.meta.dir}/matches`);
        }

        /**
         * Returns a JSON-convertible representation
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} options - The formatting options
         * @param {Boolean} options.debug - If true, includes debug information
         * @returns {Object} - the promise resolving to the JSON object
         */
        function toJSON (options = {}) {
            return readHeader().then(header => {
                const responsePromises = header.stubs.map(loadResponses),
                    debugPromises = options.debug ? header.stubs.map(loadMatches) : [];

                return Q.all(responsePromises).then(stubResponses => {
                    return Q.all(debugPromises).then(matches => {
                        header.stubs.forEach((stub, index) => {
                            stub.responses = stubResponses[index];
                            if (options.debug && matches[index].length > 0) {
                                stub.matches = matches[index];
                            }
                            delete stub.meta;
                        });
                        return header.stubs;
                    });
                });
            });
        }

        function isRecordedResponse (response) {
            return response.is && typeof response.is._proxyResponseTime === 'number'; // eslint-disable-line no-underscore-dangle
        }

        /**
         * Removes the saved proxy responses
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - Promise
         */
        function deleteSavedProxyResponses () {
            return toJSON().then(allStubs => {
                allStubs.forEach(stub => {
                    stub.responses = stub.responses.filter(response => !isRecordedResponse(response));
                });
                allStubs = allStubs.filter(stub => stub.responses.length > 0);
                return overwriteAll(allStubs);
            });
        }

        /**
         * Adds a request for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} request - the request
         * @returns {Object} - the promise
         */
        function addRequest (request) {
            const helpers = require('../util/helpers');

            const recordedRequest = helpers.clone(request);
            recordedRequest.timestamp = new Date().toJSON();

            return writeFile(requestPath(recordedRequest), recordedRequest);
        }

        /**
         * Returns the saved requests for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - the promise resolving to the array of requests
         */
        function loadRequests () {
            return loadAllInDir(`${baseDir}/requests`);
        }

        /**
         * Deletes the requests directory for an imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - Promise
         */
        function deleteSavedRequests () {
            return remove(`${baseDir}/requests`);
        }

        return {
            count,
            first,
            add,
            insertAtIndex,
            overwriteAll,
            overwriteAtIndex,
            deleteAtIndex,
            toJSON,
            deleteSavedProxyResponses,
            addRequest,
            loadRequests,
            deleteSavedRequests
        };
    }

    function imposterDir (id) {
        return `${config.datadir}/${id}`;
    }

    function headerFile (id) {
        return `${imposterDir(id)}/imposter.json`;
    }

    /**
     * Returns the stubs repository for the imposter
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id of the imposter
     * @returns {Object} - the stubs repository
     */
    function stubsFor (id) {
        return stubRepository(imposterDir(id));
    }

    /**
     * Saves a reference to the imposter so that the functions
     * (which can't be persisted) can be rehydrated to a loaded imposter.
     * This means that any data in the function closures will be held in
     * memory.
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Object} imposter - the imposter
     */
    function addReference (imposter) {
        const id = String(imposter.port);
        imposterFns[id] = {};
        Object.keys(imposter).forEach(key => {
            if (typeof imposter[key] === 'function') {
                imposterFns[id][key] = imposter[key];
            }
        });
    }

    function rehydrate (imposter) {
        const id = String(imposter.port);
        Object.keys(imposterFns[id]).forEach(key => {
            imposter[key] = imposterFns[id][key];
        });
    }

    /**
     * Adds a new imposter
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    function add (imposter) {
        const imposterConfig = imposter.creationRequest,
            stubs = imposterConfig.stubs || [],
            promises = stubs.map(stub => saveStubMetaAndResponses(stub, imposterDir(imposter.port)));

        delete imposterConfig.requests;

        return Q.all(promises).then(stubDefinitions => {
            imposterConfig.port = imposter.port;
            imposterConfig.stubs = stubDefinitions;
            return writeFile(headerFile(imposter.port), imposterConfig);
        }).then(() => {
            addReference(imposter);
            return imposter;
        });
    }

    /**
     * Gets the imposter by id
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the promise resolving to the imposter
     */
    function get (id) {
        return readFile(headerFile(id), null).then(header => {
            if (header === null) {
                return Q(null);
            }

            return stubsFor(id).toJSON().then(stubs => {
                header.stubs = stubs;
                rehydrate(header);
                return header;
            });
        });
    }

    /**
     * Gets all imposters
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @returns {Object} - all imposters keyed by port
     */
    function all () {
        return Q.all(Object.keys(imposterFns).map(get));
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return Q(Object.keys(imposterFns).indexOf(String(id)) >= 0);
    }

    function shutdown (id) {
        if (typeof imposterFns[String(id)] === 'undefined') {
            return Q();
        }

        const fn = imposterFns[String(id)].stop;
        delete imposterFns[String(id)];
        return fn ? fn() : Q();
    }

    /**
     * Deletes the imposter at the given id
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        return get(id).then(imposter => {
            const promises = [shutdown(id)];
            if (imposter !== null) {
                promises.push(remove(imposterDir(id)));
            }

            return Q.all(promises).then(() => imposter);
        });
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     * @memberOf module:models/filesystemBackedImpostersRepository#
     */
    function stopAllSync () {
        Object.keys(imposterFns).forEach(shutdown);
    }

    /**
     * Deletes all imposters
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @returns {Object} - the deletion promise
     */
    function deleteAll () {
        const ids = Object.keys(imposterFns),
            dirs = ids.map(imposterDir),
            promises = ids.map(shutdown).concat(dirs.map(remove));

        // Remove only the directories for imposters we have a reference to
        return Q.all(promises)
            .then(() => readdir(config.datadir))
            .then(entries => {
                if (entries.length === 0) {
                    return remove(config.datadir);
                }
                else {
                    return Q();
                }
            });
    }

    return {
        add,
        addReference,
        get,
        all,
        exists,
        del,
        stopAllSync,
        deleteAll,
        stubsFor
    };
}

module.exports = { create };
