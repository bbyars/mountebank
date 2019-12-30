'use strict';

/**
 * An abstraction for loading imposters from in-memory
 * @module
 */

const Stub = {
    create: function (config) {
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

        const helpers = require('../util/helpers'),
            stub = helpers.clone(config || {}),
            Q = require('q');

        stub.responses = stub.responses || [{ is: {} }];

        const statefulResponses = repeatTransform(stub.responses);

        /**
         * Adds a new response to the stub (e.g. during proxying)
         * @param {Object} response - the response to add
         * @returns {Object} - the promise
         */
        stub.addResponse = response => {
            stub.responses.push(response);
            return Q(response);
        };

        /**
         * Selects the next response from the stub, including repeat behavior and circling back to the beginning
         * @returns {Object} - the response
         * @returns {Object} - the promise
         */
        stub.nextResponse = () => {
            const responseConfig = statefulResponses.shift(),
                Response = require('./response');

            statefulResponses.push(responseConfig);
            return Q(Response.create(responseConfig, stub));
        };

        /**
         * Deletes responses matching the filter
         * @param {Function} filter - the filter function
         */
        stub.deleteResponsesMatching = filter => {
            stub.responses = stub.responses.filter(response => !filter(response));
        };

        return stub;
    }
};

/**
 * Creates the stubs repository for a single imposter
 * @returns {Object}
 */
function createStubsRepository () {
    const stubs = [],
        Q = require('q');

    /**
     * Returns the first stub matching the filter, or a default one if none match
     * @param {Function} filter - the filter function
     * @returns {Object}
     */
    function first (filter) {
        for (let i = 0; i < stubs.length; i += 1) {
            if (filter(stubs[i])) {
                return Q({ success: true, index: i, stub: stubs[i] });
            }
        }
        return Q({ success: false, index: -1, stub: Stub.create() });
    }

    /**
     * Adds a new stub
     * @param {Object} stub - the stub to add
     * @returns {Object} - the promise
     */
    function add (stub) {
        stubs.push(Stub.create(stub));
        return Q();
    }

    /**
     * Inserts a new stub at the given index
     * @param {Object} stub - the stub to insert
     * @param {Number} index - the index to add the stub at
     * @returns {Object} - the promise
     */
    function insertAtIndex (stub, index) {
        stubs.splice(index, 0, Stub.create(stub));
        return Q();
    }

    /**
     * Overwrites the list of stubs with a new list
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    function overwriteAll (newStubs) {
        while (stubs.length > 0) {
            stubs.pop();
        }
        newStubs.forEach(stub => add(stub));
        return Q();
    }

    /**
     * Overwrites the stub at the given index with the new stub
     * @param {Object} newStub - the new stub
     * @param {Number} index - the index of the old stuib
     * @returns {Object} - the promise
     */
    function overwriteAtIndex (newStub, index) {
        stubs[index] = Stub.create(newStub);
        return Q();
    }

    /**
     * Deletes the stub at the given index
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    function deleteAtIndex (index) {
        stubs.splice(index, 1);
        return Q();
    }

    /**
     * Returns all stubs
     * @returns {Object} -the promise resolving to the list of stubs
     */
    function all () {
        const helpers = require('../util/helpers'),
            result = helpers.clone(stubs);

        for (var i = 0; i < stubs.length; i += 1) {
            const realStub = stubs[i],
                exposedStub = result[i];

            // Proxy cloned functions to underlying object
            exposedStub.addResponse = realStub.addResponse;
            exposedStub.deleteResponsesMatching = filter => {
                realStub.deleteResponsesMatching(filter);
                exposedStub.responses = realStub.responses;
            };
            exposedStub.nextResponse = realStub.nextResponse;
        }
        return Q(result);
    }

    return {
        count: () => stubs.length,
        first,
        add,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        all
    };
}

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
        if (!imposter.stubs) {
            imposter.stubs = [];
        }
        imposters[imposter.port] = imposter;
        return Q(imposter);
    }

    /**
     * Gets the imposter by id
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the imposter
     */
    function get (id) {
        return Q(imposters[String(id)] || null);
    }

    /**
     * Gets all imposters
     * @returns {Object} - all imposters keyed by port
     */
    function all () {
        return Q(imposters);
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    function exists (id) {
        return Q(typeof imposters[String(id)] !== 'undefined');
    }

    /**
     * Deletes the imposter at the given id
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    function del (id) {
        const result = imposters[String(id)] || null;
        delete imposters[String(id)];
        if (result) {
            return result.stop().then(() => Q(result));
        }
        else {
            return Q(result);
        }
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     */
    function deleteAllSync () {
        Object.keys(imposters).forEach(id => {
            imposters[id].stop();
            delete imposters[id];
        });
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
        all,
        exists,
        del,
        deleteAllSync,
        deleteAll,
        stubsFor: createStubsRepository,
        createStubsRepository
    };
}

module.exports = { create };
