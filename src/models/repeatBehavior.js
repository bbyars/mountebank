'use strict';

var helpers = require('../util/helpers');

/**
 * Executes the repeat behavior for a stub.
 * @module
 */

/**
 * Creates an instance of RepeatBehavior
 *
 * Repeat Behavior is stateful, so a new instance must be created
 * for each request.
 * @returns {Object} RepeatBehavior instance
 */
function create () {
    var repeats = {};

    function hasRepeatBehavior (response) {
        return response._behaviors && response._behaviors.repeat;
    }

    function defaultResponse (stub, response) {
        stub.responses.push(response);
        response = { is: {} };
        return response;
    }

    function repeatResponse (alreadyTraversed, key, response, stub) {
        alreadyTraversed[key] = response;

        if (!repeats[key]) {
            repeats[key] = 0;
        }

        if (repeats[key] < response._behaviors.repeat) {
            repeats[key] += 1;

            stub.responses.unshift(response);
        }
        else {
            stub.responses.push(response);
            response = getNextResponse(stub, alreadyTraversed);
        }
        return response;
    }

    function cloneAndClean (response) {
        var clone = helpers.clone(response);

        // https://github.com/bbyars/mountebank/issues/158
        if (clone.is && clone.is.headers) {
            delete clone.is.headers.connection;
            delete clone.is.headers.Connection;
        }
        return clone;
    }

    /* eslint no-use-before-define: 0 */ // Recursion prevents proper ordering of functions
    function getNextResponse (stub, alreadyTraversed) {
        var response = stub.responses.shift(),
            clone = cloneAndClean(response),
            key = JSON.stringify(clone);

        if (hasRepeatBehavior(response)) {
            if (alreadyTraversed[key]) {
                response = defaultResponse(stub, response);
            }
            else {
                response = repeatResponse(alreadyTraversed, key, response, stub);
            }
        }
        else {
            stub.responses.push(response);
        }

        return response;
    }

    /**
     * Executes the repeat behavior of a stub.  It either returns the next response
     * or returns the default response if all repeats have been exhausted.
     * @param {Object} stub - The stub to execute repeat behavior on
     * @returns {Object} response - The response
     */
    function execute (stub) {
        return getNextResponse(stub, {});
    }

    return {
        execute: execute
    };
}


module.exports = {
    create: create
};
