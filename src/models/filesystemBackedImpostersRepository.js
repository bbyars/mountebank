'use strict';

const fsExtra = require('fs-extra'),
    prometheus = require('prom-client'),
    properLockFile = require('proper-lockfile'),
    pathModule = require('path'),
    helpers = require('../util/helpers.js'),
    errors = require('../util/errors.js');

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
 * There are some extra checks on filesystem operations (atomicWriteFile) due to antivirus software, solar flares,
 * gremlins, etc. graceful-fs solves some of these, but apparently not all.
 *
 * @module
 */

const
    metrics = {
        lockAcquireDuration: new prometheus.Histogram({
            name: 'mb_lock_acquire_duration_seconds',
            help: 'Time it takes to acquire a file lock',
            buckets: [0.1, 0.2, 0.5, 1, 3, 5, 10, 30],
            labelNames: ['caller']
        }),
        lockHoldDuration: new prometheus.Histogram({
            name: 'mb_lock_hold_duration_seconds',
            help: 'Time a file lock is held',
            buckets: [0.1, 0.2, 0.5, 1, 2],
            labelNames: ['caller']
        }),
        lockErrors: new prometheus.Counter({
            name: 'mb_lock_errors_total',
            help: 'Number of lock errors',
            labelNames: ['caller', 'code']
        })
    };

/**
 * Creates the repository
 * @param {Object} config - The database configuration
 * @param {String} config.datadir - The database directory
 * @param {Object} logger - The logger
 * @returns {Object}
 */
function create (config, logger) {
    const imposterFns = {};
    let counter = 0,
        locks = 0;

    async function ensureDir (filepath) {
        const dir = pathModule.dirname(filepath);

        await fsExtra.ensureDir(dir);
    }

    async function ensureFile (filepath) {
        fsExtra.close(await fsExtra.open(filepath, 'as'));
    }

    async function writeFile (filepath, obj) {
        await ensureDir(filepath);
        await ensureFile(filepath);
        await fsExtra.writeFile(filepath, JSON.stringify(obj, null, 2), {
            flag: 'rs+'
        });
    }

    function tryParse (maybeJSON, filepath) {
        try {
            return JSON.parse(maybeJSON);
        }
        catch (parseErr) {
            logger.error(`Corrupted database: invalid JSON for ${filepath}`);
            throw errors.DatabaseError(`invalid JSON in ${filepath}`, { details: parseErr.message });
        }
    }

    async function readFile (filepath, defaultContents) {
        try {
            const data = await fsExtra.readFile(filepath, 'utf8');
            return tryParse(data, filepath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                if (typeof defaultContents === 'undefined') {
                    logger.error(`Corrupted database: missing file ${filepath}`);
                    throw errors.DatabaseError('file not found', { details: err.message });
                }
                else {
                    return defaultContents;
                }
            }
            else {
                throw err;
            }
        }
    }

    function delay (duration) {
        return new Promise(resolve => {
            setTimeout(resolve, duration);
        });
    }

    async function atomicWriteFile (filepath, obj, attempts = 1) {
        const tmpfile = filepath + '.tmp';

        try {
            await writeFile(tmpfile, obj);
            await fsExtra.rename(tmpfile, filepath);
        }
        catch (err) {
            if (err.code === 'ENOENT' && attempts < 15) {
                logger.debug(`Attempt ${attempts} failed with ENOENT error on atomic write of ${filepath}. Retrying...`);
                await delay(10);
                await atomicWriteFile(filepath, obj, attempts + 1);
            }
            else {
                throw err;
            }
        }
    }

    async function lockFile (filepath) {
        const options = {
            realpath: false,
            retries: {
                retries: 20,
                minTimeout: 10,
                maxTimeout: 5000,
                randomize: true,
                factor: 1.5
            },
            stale: 30000
        };

        // with realpath = false, the file doesn't have to exist, but the directory does
        await ensureDir(filepath);
        return properLockFile.lock(filepath, options);
    }

    async function readAndWriteFile (filepath, caller, transformer, defaultContents) {
        const currentLockId = locks,
            observeLockAcquireDuration = metrics.lockAcquireDuration.startTimer({ caller });

        locks += 1;

        try {
            const release = await lockFile(filepath),
                acquireLockSeconds = observeLockAcquireDuration(),
                observeLockHoldDuration = metrics.lockHoldDuration.startTimer({ caller });

            logger.debug(`Acquired file lock on ${filepath} for ${caller}-${currentLockId} after ${acquireLockSeconds}s`);

            const original = await readFile(filepath, defaultContents),
                transformed = await transformer(original);

            await atomicWriteFile(filepath, transformed);
            await release();

            const lockHeld = observeLockHoldDuration();
            logger.debug(`Released file lock on ${filepath} for ${caller}-${currentLockId} after ${lockHeld}s`);
        }
        catch (err) {
            // Ignore lock already released errors
            if (err.code !== 'ERELEASED') {
                metrics.lockErrors.inc({ caller, code: err.code });
                properLockFile.unlock(filepath, { realpath: false }).catch(() => { /* ignore */ });
                throw err;
            }
        }
    }

    async function remove (path) {
        await fsExtra.remove(path);
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
        return new Promise((resolve, reject) => {
            fsExtra.readdir(path, (err, files) => {
                if (err && err.code === 'ENOENT') {
                    // Nothing saved yet
                    resolve([]);
                }
                else if (err) {
                    reject(err);
                }
                else {
                    resolve(files);
                }
            });
        });
    }

    async function loadAllInDir (path) {
        const files = await readdir(path),
            reads = files
                .filter(file => file.indexOf('.json') > 0)
                .sort(timeSorter)
                .map(file => readFile(`${path}/${file}`));

        return Promise.all(reads);
    }

    function repeatsFor (response) {
        return response.repeat || 1;
    }

    async function saveStubMetaAndResponses (stub, baseDir) {
        const stubDefinition = {
                meta: { dir: `stubs/${filenameFor(new Date())}` }
            },
            meta = {
                responseFiles: [],
                orderWithRepeats: [],
                nextIndex: 0
            },
            responses = stub.responses || [],
            writes = [];

        if (stub.predicates) {
            stubDefinition.predicates = stub.predicates;
        }

        for (let i = 0; i < responses.length; i += 1) {
            const responseFile = `responses/${filenameFor(new Date())}.json`;
            meta.responseFiles.push(responseFile);

            for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                meta.orderWithRepeats.push(i);
            }

            writes.push(writeFile(`${baseDir}/${stubDefinition.meta.dir}/${responseFile}`, responses[i]));
        }

        writes.push(writeFile(`${baseDir}/${stubDefinition.meta.dir}/meta.json`, meta));
        await Promise.all(writes);
        return stubDefinition;
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
            const cloned = helpers.clone(stub || {}),
                stubDir = stub ? stub.meta.dir : '';

            if (typeof stub === 'undefined') {
                return {
                    addResponse: () => Promise.resolve(),
                    nextResponse: () => Promise.resolve({
                        is: {},
                        stubIndex: () => Promise.resolve(0)
                    }),
                    recordMatch: () => Promise.resolve()
                };
            }

            delete cloned.meta;

            /**
             * Adds a response to the stub
             * @memberOf module:models/filesystemBackedImpostersRepository#
             * @param {Object} response - the new response
             * @returns {Object} - the promise
             */
            cloned.addResponse = async response => {
                let responseFile;
                await readAndWriteFile(metaPath(stubDir), 'addResponse', async meta => {
                    const responseIndex = meta.responseFiles.length;
                    responseFile = `responses/${filenameFor(new Date())}.json`;

                    meta.responseFiles.push(responseFile);
                    for (let repeats = 0; repeats < repeatsFor(response); repeats += 1) {
                        meta.orderWithRepeats.push(responseIndex);
                    }

                    await writeFile(responsePath(stubDir, responseFile), response);
                    return meta;
                });
            };

            async function stubIndex () {
                const header = await readHeader();
                for (let i = 0; i < header.stubs.length; i += 1) {
                    if (header.stubs[i].meta.dir === stubDir) {
                        return i;
                    }
                }
                return 0;
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
            cloned.nextResponse = async () => {
                let responseFile;
                await readAndWriteFile(metaPath(stubDir), 'nextResponse', async meta => {
                    const maxIndex = meta.orderWithRepeats.length,
                        responseIndex = meta.orderWithRepeats[meta.nextIndex % maxIndex];

                    responseFile = meta.responseFiles[responseIndex];

                    meta.nextIndex = (meta.nextIndex + 1) % maxIndex;
                    return meta;
                });

                // No need to read the response file while the lock is held
                const responseConfig = await readFile(responsePath(stubDir, responseFile));
                return createResponse(responseConfig);
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
            cloned.recordMatch = async (request, response, responseConfig, processingTime) => {
                const match = {
                    timestamp: new Date().toJSON(),
                    request,
                    response,
                    responseConfig,
                    processingTime
                };
                await writeFile(matchPath(stubDir, match), match);
            };

            return cloned;
        }

        /**
         * Returns the number of stubs for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - the promise
         */
        async function count () {
            const imposter = await readHeader();
            return imposter.stubs.length;
        }

        /**
         * Returns the first stub whose predicates matches the filter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Function} filter - the filter function
         * @param {Number} startIndex - the index to to start searching
         * @returns {Object} - the promise
         */
        async function first (filter, startIndex = 0) {
            const header = await readHeader();

            for (let i = startIndex; i < header.stubs.length; i += 1) {
                if (filter(header.stubs[i].predicates || [])) {
                    return { success: true, stub: wrap(header.stubs[i]) };
                }
            }
            return { success: false, stub: wrap() };
        }

        /**
         * Adds a new stub to imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the stub to add
         * @returns {Object} - the promise
         */
        async function add (stub) { // eslint-disable-line no-shadow
            const stubDefinition = await saveStubMetaAndResponses(stub, baseDir);

            await readAndWriteHeader('addStub', async header => {
                header.stubs.push(stubDefinition);
                return header;
            });
        }

        /**
         * Inserts a new stub at the given index
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the stub to add
         * @param {Number} index - the index to insert the new stub at
         * @returns {Object} - the promise
         */
        async function insertAtIndex (stub, index) {
            const stubDefinition = await saveStubMetaAndResponses(stub, baseDir);

            await readAndWriteHeader('insertStubAtIndex', async header => {
                header.stubs.splice(index, 0, stubDefinition);
                return header;
            });
        }

        /**
         * Deletes the stub at the given index
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Number} index - the index of the stub to delete
         * @returns {Object} - the promise
         */
        async function deleteAtIndex (index) {
            let stubDir;

            await readAndWriteHeader('deleteStubAtIndex', async header => {
                if (typeof header.stubs[index] === 'undefined') {
                    throw errors.MissingResourceError(`no stub at index ${index}`);
                }

                stubDir = header.stubs[index].meta.dir;
                header.stubs.splice(index, 1);
                return header;
            });

            await remove(`${baseDir}/${stubDir}`);
        }

        /**
         * Overwrites all stubs with a new list
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} newStubs - the new list of stubs
         * @returns {Object} - the promise
         */
        async function overwriteAll (newStubs) {
            await readAndWriteHeader('overwriteAllStubs', async header => {
                header.stubs = [];
                await remove(`${baseDir}/stubs`);
                return header;
            });

            let addSequence = Promise.resolve();
            newStubs.forEach(stub => {
                addSequence = addSequence.then(() => add(stub));
            });
            await addSequence;
        }

        /**
         * Overwrites the stub at the given index
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} stub - the new stub
         * @param {Number} index - the index of the stub to overwrite
         * @returns {Object} - the promise
         */
        async function overwriteAtIndex (stub, index) {
            await deleteAtIndex(index);
            await insertAtIndex(stub, index);
        }

        async function loadResponses (stub) {
            const meta = await readFile(metaPath(stub.meta.dir));
            return Promise.all(meta.responseFiles.map(responseFile =>
                readFile(responsePath(stub.meta.dir, responseFile))));
        }

        async function loadMatches (stub) {
            return loadAllInDir(`${baseDir}/${stub.meta.dir}/matches`);
        }

        /**
         * Returns a JSON-convertible representation
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} options - The formatting options
         * @param {Boolean} options.debug - If true, includes debug information
         * @returns {Object} - the promise resolving to the JSON object
         */
        async function toJSON (options = {}) {
            const header = await readHeader(),
                responsePromises = header.stubs.map(loadResponses),
                stubResponses = await Promise.all(responsePromises),
                debugPromises = options.debug ? header.stubs.map(loadMatches) : [],
                matches = await Promise.all(debugPromises);

            header.stubs.forEach((stub, index) => {
                stub.responses = stubResponses[index];
                if (options.debug && matches[index].length > 0) {
                    stub.matches = matches[index];
                }
                delete stub.meta;
            });

            return header.stubs;
        }

        function isRecordedResponse (response) {
            return response.is && typeof response.is._proxyResponseTime === 'number';
        }

        /**
         * Removes the saved proxy responses
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - Promise
         */
        async function deleteSavedProxyResponses () {
            const allStubs = await toJSON();
            allStubs.forEach(stub => {
                stub.responses = stub.responses.filter(response => !isRecordedResponse(response));
            });

            const nonProxyStubs = allStubs.filter(stub => stub.responses.length > 0);
            return overwriteAll(nonProxyStubs);
        }

        /**
         * Adds a request for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @param {Object} request - the request
         * @returns {Object} - the promise
         */
        async function addRequest (request) {
            const recordedRequest = helpers.clone(request);

            recordedRequest.timestamp = new Date().toJSON();
            await writeFile(requestPath(recordedRequest), recordedRequest);
        }

        /**
         * Returns the saved requests for the imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - the promise resolving to the array of requests
         */
        async function loadRequests () {
            return loadAllInDir(`${baseDir}/requests`);
        }

        /**
         * Deletes the requests directory for an imposter
         * @memberOf module:models/filesystemBackedImpostersRepository#
         * @returns {Object} - Promise
         */
        async function deleteSavedRequests () {
            await remove(`${baseDir}/requests`);
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
    async function add (imposter) {
        const imposterConfig = imposter.creationRequest,
            stubs = imposterConfig.stubs || [],
            saveStubs = stubs.map(stub => saveStubMetaAndResponses(stub, imposterDir(imposter.port))),
            stubDefinitions = await Promise.all(saveStubs);

        delete imposterConfig.requests;
        imposterConfig.port = imposter.port;
        imposterConfig.stubs = stubDefinitions;
        await writeFile(headerFile(imposter.port), imposterConfig);

        addReference(imposter);
        return imposter;
    }

    /**
     * Gets the imposter by id
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the promise resolving to the imposter
     */
    async function get (id) {
        const header = await readFile(headerFile(id), null);
        if (header === null) {
            return null;
        }

        header.stubs = await stubsFor(id).toJSON();
        rehydrate(header);
        return header;
    }

    /**
     * Gets all imposters
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @returns {Object} - all imposters keyed by port
     */
    async function all () {
        return Promise.all(Object.keys(imposterFns).map(get));
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    async function exists (id) {
        return Object.keys(imposterFns).indexOf(String(id)) >= 0;
    }

    async function shutdown (id) {
        if (typeof imposterFns[String(id)] === 'undefined') {
            return;
        }

        const stop = imposterFns[String(id)].stop;
        delete imposterFns[String(id)];
        if (stop) {
            await stop();
        }
    }

    /**
     * Deletes the imposter at the given id
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    async function del (id) {
        const imposter = await get(id),
            cleanup = [shutdown(id)];

        if (imposter !== null) {
            cleanup.push(remove(imposterDir(id)));
        }

        await Promise.all(cleanup);
        return imposter;
    }

    /**
     * Deletes all imposters; used during testing
     * @memberOf module:models/filesystemBackedImpostersRepository#
     */
    async function stopAll () {
        const promises = Object.keys(imposterFns).map(shutdown);
        await Promise.all(promises);
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
    async function deleteAll () {
        const ids = Object.keys(imposterFns),
            dirs = ids.map(imposterDir),
            deleteImposter = ids.map(shutdown).concat(dirs.map(remove));

        // Remove only the directories for imposters we have a reference to
        await Promise.all(deleteImposter);
        const entries = await readdir(config.datadir);
        if (entries.length === 0) {
            await remove(config.datadir);
        }
    }

    async function loadImposterFrom (dir, protocols) {
        const imposterFilename = `${config.datadir}/${dir}/imposter.json`;

        if (!fsExtra.existsSync(imposterFilename)) {
            logger.warn(`Skipping ${dir} during loading; missing imposter.json`);
            return;
        }

        const imposterConfig = JSON.parse(fsExtra.readFileSync(imposterFilename)),
            protocol = protocols[imposterConfig.protocol];

        if (protocol) {
            logger.info(`Loading ${imposterConfig.protocol}:${dir} from datadir`);
            const imposter = await protocol.createImposterFrom(imposterConfig);
            addReference(imposter);
        }
        else {
            logger.error(`Cannot load imposter ${dir}; no protocol loaded for ${config.protocol}`);
        }
    }

    /**
     * Loads all saved imposters at startup
     * @memberOf module:models/filesystemBackedImpostersRepository#
     * @param {Object} protocols - The protocol map, used to instantiate a new instance
     * @returns {Object} - a promise
     */
    async function loadAll (protocols) {
        if (!config.datadir || !fsExtra.existsSync(config.datadir)) {
            return;
        }

        const dirs = fsExtra.readdirSync(config.datadir),
            promises = dirs.map(async dir => loadImposterFrom(dir, protocols));
        await Promise.all(promises);
    }

    return {
        add,
        addReference,
        get,
        all,
        exists,
        del,
        stopAll,
        stopAllSync,
        deleteAll,
        stubsFor,
        loadAll
    };
}

module.exports = { create };
