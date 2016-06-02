'use strict';

/**
 * Executes the repeat behavior for a stub.
 * @module
 */


/**
 * Creates an instance of RepeatBehavior
 *
 * Repeat Behavior is stateful, so a new instance must be created
 * for each request.
 * @returns {{execute: execute}}
 */
function create () {
    var repeats = {};

    function getNextResponse (stub, traversed) {
        var response = stub.responses.shift();

        if (response._behaviors && response._behaviors.repeat) {
            var key = JSON.stringify(response);

            if (traversed[key]) {
                stub.responses.push(response);
                response = { is: {} };
            }
            else {
                traversed[key] = response;

                if (!repeats[key]) {
                    repeats[key] = 0;
                }

                if (repeats[key] < response._behaviors.repeat) {
                    repeats[key] += 1;

                    stub.responses.unshift(response);
                }
                else {
                    stub.responses.push(response);
                    response = getNextResponse(stub, traversed);
                }
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
     * @returns {Object} The response
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
