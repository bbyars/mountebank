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
 *     /requests
 *       /{epoch-pid-counter}.json
 *         { ... }
 *
 * This structure is designed to improve parallelism and throughput.
 *
 * The imposters.json file needs to be locked during imposter-level activities (e.g. adding a stub).
 * Readers do not lock; they just get the data at the time they read it. Since this file doesn't
 * contain transient state, there's no harm from a stale read. Writes (which happen for
 * stub changing operations, either for proxy response recording or stub API calls) grab a file lock
 * for both the read and the write. Writes to this file should be infrequent, except perhaps during
 * proxy recording. Newly added stubs may change the index of existing stubs in the stubs array, but
 * will never change the stub meta.dir, which is guaranteed to be unique amongst processes on the same
 * machine (and almost certainly guaranteed to be unique across processes on multiple machines) so once
 * an operation has grabbed the dir, it is safe to use it.
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
 * The requests use timestamp-based filenames to avoid having to lock any file to update an index.
 * Since the timestamp has millisecond granularity and it's possible that two requests could be recorded during
 * the same millisecond, and since multiple processes may be writing requests, we append a pid and counter
 * to the timestamp to guarantee we don't accidentally overwrite one request with another. After consideration,
 * I decided not to support saving matches (from the --debug flag) with this repository, as I consider supporting
 * that a tactical design error. It is still supported using the default inMemoryImposterRepository, and, if
 * needed, could be supported here using the same naming convention used by requests.
 *
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

function readFile (filepath, logger = console, defaultContents) {
    const Q = require('q'),
        deferred = Q.defer(),
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
            deferred.reject(err);
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
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs');

    fs.rename(oldPath, newPath, err => {
        if (err) {
            deferred.reject(err);
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
        Q = require('q'),
        deferred = Q.defer();

    fs.ensureDir(dir, err => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(dir);
        }
    });

    return deferred.promise;
}

function readAndWriteFile (filepath, transformer, logger = console, defaultContents) {
    const locker = require('proper-lockfile'),
        options = {
            realpath: false,
            retries: {
                retries: 5,
                factor: 2,
                minTimeout: 50,
                randomize: true
            }
        },
        tmpfile = filepath + '.tmp',
        Q = require('q');

    // with realpath = false, the file doesn't have to exist, but the directory does
    return ensureDir(filepath)
        .then(() => locker.lock(filepath, options))
        .then(release => {
            return readFile(filepath, logger, defaultContents)
                .then(original => transformer(original))
                .then(transformed => writeFile(tmpfile, transformed))
                .then(() => rename(tmpfile, filepath))
                .then(() => release())
                .catch(err => {
                    return release().then(() => Q.reject(err));
                });
        })
        .catch(err => {
            logger.error(`Unable to acquire or release lock on ${filepath}: ${err}`);
            return Q.reject(err);
        });
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

function loadAllInDir (path, logger) {
    const Q = require('q'),
        deferred = Q.defer(),
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
            const promises = files
                .filter(file => file.indexOf('.json') > 0)
                .sort(timeSorter)
                .map(file => readFile(`${path}/${file}`, logger));

            Q.all(promises).done(deferred.resolve);
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

function stubRepository (imposterDir, logger) {
    const headerFile = `${imposterDir}/imposter.json`;
    let counter = 0;

    function metaPath (stubDir) {
        return `${imposterDir}/${stubDir}/meta.json`;
    }

    function responsePath (stubDir, responseFile) {
        return `${imposterDir}/${stubDir}/${responseFile}`;
    }

    function requestPath (request) {
        const epoch = Date.parse(request.timestamp).valueOf();
        counter += 1;
        return `${imposterDir}/requests/${epoch}-${process.pid}-${counter}.json`;
    }

    function readHeader () {
        // Due to historical design decisions when everything was in memory, stubs are actually
        // added (in imposter.js) _before_ the imposter is added (in impostersController.js). This
        // means that the stubs repository needs to gracefully handle the case where the header file
        // does not yet exist
        return readFile(headerFile, logger, { stubs: [] });
    }

    function readAndWriteHeader (transformer) {
        return readAndWriteFile(headerFile, transformer, logger, { stubs: [] });
    }

    function next (paths, template) {
        if (paths.length === 0) {
            return template.replace('${index}', 0);
        }

        const numbers = paths.map(file => parseInt(file.match(/\d+/)[0])),
            max = Math.max(...numbers);

        return template.replace('${index}', max + 1);
    }

    function wrap (stub) {
        const Response = require('./response'),
            Q = require('q'),
            helpers = require('../util/helpers'),
            cloned = helpers.clone(stub || {}),
            stubDir = stub ? stub.meta.dir : '';

        if (typeof stub === 'undefined') {
            return {
                addResponse: () => Q(),
                nextResponse: () => Q(Response.create()),
                recordMatch: () => Q()
            };
        }

        delete cloned.meta;

        /**
         * Adds a response to the stub
         * @param {Object} response - the new response
         * @returns {Object} - the promise
         */
        cloned.addResponse = response => {
            let responseFile;
            return readAndWriteFile(metaPath(stubDir), meta => {
                const responseIndex = meta.responseFiles.length;
                responseFile = next(meta.responseFiles, 'responses/${index}.json');

                meta.responseFiles.push(responseFile);
                for (let repeats = 0; repeats < repeatsFor(response); repeats += 1) {
                    meta.orderWithRepeats.push(responseIndex);
                }

                return writeFile(responsePath(stubDir, responseFile), response).then(() => meta);
            }, logger);
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

        /**
         * Returns the next response for the stub, taking into consideration repeat behavior and cycling back the beginning
         * @returns {Object} - the promise
         */
        cloned.nextResponse = () => {
            let responseFile;
            return readAndWriteFile(metaPath(stubDir), meta => {
                const maxIndex = meta.orderWithRepeats.length,
                    responseIndex = meta.orderWithRepeats[meta.nextIndex % maxIndex];

                responseFile = meta.responseFiles[responseIndex];

                meta.nextIndex = (meta.nextIndex + 1) % maxIndex;
                return Q(meta);
            }).then(() => readFile(responsePath(stubDir, responseFile), logger))
                .then(responseConfig => Response.create(responseConfig, stubIndex));
        };

        cloned.recordMatch = () => Q();
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
                meta: { dir: '' }
            },
            meta = {
                responseFiles: [],
                orderWithRepeats: [],
                nextIndex: 0
            },
            responses = stub.responses || [],
            Q = require('q'),
            promises = [];

        return readAndWriteHeader(header => {
            stubDefinition.meta.dir = next(header.stubs.map(saved => saved.meta.dir), 'stubs/${index}');

            for (let i = 0; i < responses.length; i += 1) {
                const responseFile = `responses/${i}.json`;
                meta.responseFiles.push(responseFile);

                for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                    meta.orderWithRepeats.push(i);
                }

                promises.push(writeFile(responsePath(stubDefinition.meta.dir, responseFile), responses[i]));
            }

            promises.push(writeFile(metaPath(stubDefinition.meta.dir), meta));
            header.stubs.splice(index, 0, stubDefinition);
            return Q.all(promises).then(() => header);
        });
    }

    /**
     * Deletes the stub at the given index
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    function deleteAtIndex (index) {
        let stubDir;

        return readAndWriteHeader(header => {
            const errors = require('../util/errors'),
                Q = require('q');

            if (typeof header.stubs[index] === 'undefined') {
                return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
            }

            stubDir = header.stubs[index].meta.dir;
            header.stubs.splice(index, 1);
            return Q(header);
        }).then(() => remove(`${imposterDir}/${stubDir}`));
    }

    /**
     * Overwrites all stubs with a new list
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    function overwriteAll (newStubs) {
        const Q = require('q');

        return readAndWriteHeader(header => {
            header.stubs = [];
            return remove(`${imposterDir}/stubs`).then(() => header);
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

    function loadResponses (stub) {
        const Q = require('q');
        return readFile(metaPath(stub.meta.dir), logger)
            .then(meta => Q.all(meta.responseFiles.map(responseFile =>
                readFile(responsePath(stub.meta.dir, responseFile), logger))));
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

    function isRecordedResponse (response) {
        return response.is && response.is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
    }

    /**
     * Removes the saved proxy responses
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
     * @returns {Object} - the promise resolving to the array of requests
     */
    function loadRequests () {
        return loadAllInDir(`${imposterDir}/requests`, logger);
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
        loadRequests
    };
}

/**
 * Creates the repository
 * @param {Object} config - The database configuration
 * @param {String} config.datadir - The database directory
 * @param {Object} logger - The logger
 * @returns {Object}
 */
function create (config, logger) {
    const Q = require('q'),
        imposters = {};

    function imposterDir (id) {
        return `${config.datadir}/${id}`;
    }

    function headerFile (id) {
        return `${imposterDir(id)}/imposter.json`;
    }

    /**
     * Returns the stubs repository for the imposter
     * @param {Number} id - the id of the imposter
     * @returns {Object} - the stubs repository
     */
    function stubsFor (id) {
        return stubRepository(imposterDir(id), logger);
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
        return readAndWriteFile(headerFile(imposter.port), header => {
            const helpers = require('../util/helpers'),
                cloned = helpers.clone(imposter);
            cloned.stubs = header.stubs;
            delete cloned.requests;
            return Q(cloned);
        }, logger, { stubs: [] }).then(() => {
            const id = String(imposter.port);
            imposters[id] = { stop: imposter.stop };
            return imposter;
        });
    }

    /**
     * Gets the imposter by id
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the promise resolving to the imposter
     */
    function get (id) {
        return readFile(headerFile(id), logger, null).then(header => {
            if (header === null) {
                return Q(null);
            }

            return stubsFor(id).toJSON().then(stubs => {
                header.stubs = stubs;
                return header;
            });
        });
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function all () {
        return Q.all(Object.keys(imposters).map(get));
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
        if (typeof imposters[String(id)] === 'undefined') {
            return Q();
        }

        const fn = imposters[String(id)].stop;
        delete imposters[String(id)];
        return fn ? fn() : Q();
    }

    /**
     * Deletes the imposter at the given id
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
     */
    function deleteAllSync () {
        const fs = require('fs-extra');
        Object.keys(imposters).forEach(shutdown);
        fs.removeSync(config.datadir);
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
        stubsFor
    };
}

module.exports = { create };
