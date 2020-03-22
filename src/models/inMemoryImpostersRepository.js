'use strict';

/**
 * An abstraction for loading imposters from in-memory
 * @module
 */

function repeatsFor (response) {
    if (response._behaviors && response._behaviors.repeat) {
        return response._behaviors.repeat;
    }
    else {
        return 1;
    }
}

function repeatTransform (responses) {
    const result = [];
    let response, repeats;

    for (let i = 0; i < responses.length; i += 1) {
        response = responses[i];
        repeats = repeatsFor(response);
        for (let j = 0; j < repeats; j += 1) {
            result.push(response);
        }
    }
    return result;
}

function createResponse (responseConfig, stubIndexFn) {
    const helpers = require('../util/helpers'),
        cloned = helpers.clone(responseConfig || { is: {} });

    cloned.stubIndex = stubIndexFn ? stubIndexFn : () => require('q')(0);

    return cloned;
}

function wrap (stub = {}) {
    const Q = require('q'),
        helpers = require('../util/helpers'),
        cloned = helpers.clone(stub),
        statefulResponses = repeatTransform(cloned.responses || []);

    /**
     * Adds a new response to the stub (e.g. during proxying)
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} response - the response to add
     * @returns {Object} - the promise
     */
    cloned.addResponse = response => {
        cloned.responses = cloned.responses || [];
        cloned.responses.push(response);
        statefulResponses.push(response);
        return Q(response);
    };

    /**
     * Selects the next response from the stub, including repeat behavior and circling back to the beginning
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the response
     * @returns {Object} - the promise
     */
    cloned.nextResponse = () => {
        const responseConfig = statefulResponses.shift();

        if (responseConfig) {
            statefulResponses.push(responseConfig);
            return Q(createResponse(responseConfig, cloned.stubIndex));
        }
        else {
            return Q(createResponse());
        }
    };

    /**
     * Records a match for debugging purposes
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @param {Object} response - the response
     * @param {Object} responseConfig - the config that generated the response
     * @param {Number} processingTime - the time to match the predicate and generate the full response
     * @returns {Object} - the promise
     */
    cloned.recordMatch = (request, response, responseConfig, processingTime) => {
        cloned.matches = cloned.matches || [];
        cloned.matches.push({
            timestamp: new Date().toJSON(),
            request,
            response,
            responseConfig,
            processingTime
        });
        return Q();
    };

    return cloned;
}

/**
 * Creates the stubs repository for a single imposter
 * @returns {Object}
 */
function createStubsRepository () {
    const stubs = [],
        Q = require('q');
    let requests = [];

    function reindex () {
        // stubIndex() is used to find the right spot to insert recorded
        // proxy responses. We reindex after every state change
        stubs.forEach((stub, index) => {
            stub.stubIndex = () => Q(index);
        });
    }

    /**
     * Returns the first stub whose predicates match the filter, or a default one if none match
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Function} filter - the filter function
     * @param {Number} startIndex - the index to to start searching
     * @returns {Object}
     */
    function first (filter, startIndex = 0) {
        for (let i = startIndex; i < stubs.length; i += 1) {
            if (filter(stubs[i].predicates || [])) {
                return Q({ success: true, stub: stubs[i] });
            }
        }
        return Q({ success: false, stub: wrap() });
    }

    /**
     * Adds a new stub
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} stub - the stub to add
     * @returns {Object} - the promise
     */
    function add (stub) {
        stubs.push(wrap(stub));
        reindex();
        return Q();
    }

    /**
     * Inserts a new stub at the given index
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} stub - the stub to insert
     * @param {Number} index - the index to add the stub at
     * @returns {Object} - the promise
     */
    function insertAtIndex (stub, index) {
        stubs.splice(index, 0, wrap(stub));
        reindex();
        return Q();
    }

    /**
     * Overwrites the list of stubs with a new list
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    function overwriteAll (newStubs) {
        while (stubs.length > 0) {
            stubs.pop();
        }
        newStubs.forEach(stub => add(stub));
        reindex();
        return Q();
    }

    /**
     * Overwrites the stub at the given index with the new stub
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} newStub - the new stub
     * @param {Number} index - the index of the old stuib
     * @returns {Object} - the promise
     */
    function overwriteAtIndex (newStub, index) {
        const errors = require('../util/errors');
        if (typeof stubs[index] === 'undefined') {
            return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
        }

        stubs[index] = wrap(newStub);
        reindex();
        return Q();
    }

    /**
     * Deletes the stub at the given index
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    function deleteAtIndex (index) {
        const errors = require('../util/errors');
        if (typeof stubs[index] === 'undefined') {
            return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
        }

        stubs.splice(index, 1);
        reindex();
        return Q();
    }

    /**
     * Returns a JSON-convertible representation
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} options - The formatting options
     * @param {Boolean} options.debug - If true, includes debug information
     * @returns {Object} - the promise resolving to the JSON object
     */
    function toJSON (options = {}) {
        const helpers = require('../util/helpers'),
            cloned = helpers.clone(stubs);

        cloned.forEach(stub => {
            if (!options.debug) {
                delete stub.matches;
            }
        });

        return Q(cloned);
    }

    function isRecordedResponse (response) {
        return response.is && typeof response.is._proxyResponseTime === 'number'; // eslint-disable-line no-underscore-dangle
    }

    /**
     * Removes the saved proxy responses
     * @memberOf module:models/inMemoryImpostersRepository#
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
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - the promise
     */
    function addRequest (request) {
        const helpers = require('../util/helpers');

        const recordedRequest = helpers.clone(request);
        recordedRequest.timestamp = new Date().toJSON();
        requests.push(recordedRequest);
        return Q();
    }

    /**
     * Returns the saved requests for the imposter
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the promise resolving to the array of requests
     */
    function loadRequests () {
        return Q(requests);
    }

    /**
     * Clears the saved requests list
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - Promise
     */
    function deleteSavedRequests () {
        requests = [];
        return Q();
    }

    return {
        count: () => stubs.length,
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

/**
 * Creates the repository
 * @returns {Object}
 */
function create () {
    const imposters = {},
        stubRepos = {},
        Q = require('q');

    /**
     * Adds a new imposter
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    function add (imposter) {
        if (!imposter.stubs) {
            imposter.stubs = [];
        }
        imposters[String(imposter.port)] = imposter;

        const promises = (imposter.creationRequest.stubs || []).map(stubsFor(imposter.port).add);
        return Q.all(promises).then(() => imposter);
    }

    /**
     * Gets the imposter by id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the imposter
     */
    function get (id) {
        return Q(imposters[String(id)] || null);
    }

    /**
     * Gets all imposters
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - all imposters keyed by port
     */
    function all () {
        return Q.all(Object.keys(imposters).map(get));
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return Q(typeof imposters[String(id)] !== 'undefined');
    }

    /**
     * Deletes the imposter at the given id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        const result = imposters[String(id)] || null;
        delete imposters[String(id)];
        delete stubRepos[String(id)];

        if (result) {
            return result.stop().then(() => Q(result));
        }
        else {
            return Q(result);
        }
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     * @memberOf module:models/inMemoryImpostersRepository#
     */
    function stopAllSync () {
        Object.keys(imposters).forEach(id => {
            imposters[id].stop();
            delete imposters[id];
            delete stubRepos[id];
        });
    }

    /**
     * Deletes all imposters
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the deletion promise
     */
    function deleteAll () {
        const ids = Object.keys(imposters),
            promises = ids.map(id => imposters[id].stop());

        ids.forEach(id => {
            delete imposters[id];
            delete stubRepos[id];
        });
        return Q.all(promises);
    }

    /**
     * Returns the stub repository for the given id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the imposter's id
     * @returns {Object} - the stub repository
     */
    function stubsFor (id) {
        // In practice, the stubsFor call occurs before the imposter is actually added...
        if (!stubRepos[String(id)]) {
            stubRepos[String(id)] = createStubsRepository();
        }

        return stubRepos[String(id)];
    }

    return {
        add,
        get,
        all,
        exists,
        del,
        stopAllSync,
        deleteAll,
        stubsFor,
        createStubsRepository
    };
}

module.exports = { create };
