'use strict';

/**
 * Maintains all stubs for an imposter
 * @module
 */

/**
 * Creates the repository
 * @param {string} encoding - utf8 or base64
 * @param {Object} config - startup configuration
 * @returns {Object}
 */
function create (encoding, config) {
    const stubs = require('./inMemoryStubRepository').create(config);

    // If testAll, we call map before calling every so we make sure to call every
    // predicate during dry run validation rather than short-circuiting
    function trueForAll (list, predicate, testAll) {
        if (testAll) {
            return list.map(predicate).every(result => result);
        }
        else {
            return list.every(predicate);
        }
    }

    function findFirstMatch (request, logger, imposterState) {
        const helpers = require('../util/helpers'),
            readOnlyState = helpers.clone(imposterState),
            match = stubs.first(stub => {
                const stubPredicates = stub.predicates || [],
                    predicates = require('./predicates');

                return trueForAll(stubPredicates,
                    predicate => predicates.evaluate(predicate, request, encoding, logger, readOnlyState),
                    request.isDryRun === true);
            });

        if (typeof match === 'undefined') {
            logger.debug('no predicate match');
            return stubs.newStub();
        }
        else {
            logger.debug(`using predicate match: ${JSON.stringify(match.predicates || {})}`);
            return match;
        }
    }

    /**
     * Adds a stub to the repository
     * @memberOf module:models/stubRepository#
     * @param {Object} stub - The stub to add
     * @param {Object} beforeResponse - If provided, the new stub will be added before the stub containing the response (used for proxyOnce)
     */
    function addStub (stub, beforeResponse) {
        if (beforeResponse) {
            const responseToMatch = JSON.stringify(beforeResponse);
            stubs.insertBefore(stub, existingStub =>
                existingStub.responses.some(response => JSON.stringify(response) === responseToMatch)
            );
        }
        else {
            stubs.add(stub);
        }
    }

    /**
     * Adds a stub at stubIndex without changing the state of any other stubs
     * @memberOf module:models/stubRepository#
     * @param {Number} index - the index of the stub to change
     * @param {Object} newStub - the new stub
     */
    function addStubAtIndex (index, newStub) {
        stubs.insertAtIndex(newStub, index);
    }

    /**
     * Overwrites the entire list of stubs
     * @memberOf module:models/stubRepository#
     * @param {Object} newStubs - the new list of stubs
     */
    function overwriteStubs (newStubs) {
        stubs.overwriteAll(newStubs);
    }

    /**
     * Overwrites the stub at stubIndex without changing the state of any other stubs
     * @memberOf module:models/stubRepository#
     * @param {Number} index - the index of the stub to change
     * @param {Object} newStub - the new stub
     */
    function overwriteStubAtIndex (index, newStub) {
        stubs.overwriteAtIndex(newStub, index);
    }

    /**
     * Deletes the stub at stubIndex without changing the state of any other stubs
     * @memberOf module:models/stubRepository#
     * @param {Number} index - the index of the stub to remove
     */
    function deleteStubAtIndex (index) {
        stubs.deleteAtIndex(index);
    }

    /**
     * Returns the outside representation of the stubs
     * @memberOf module:models/stubRepository#
     * @returns {Object} - The stubs
     */
    function getStubs () {
        return stubs.getAll();
    }

    /**
     * Finds the next response configuration for the given request
     * @memberOf module:models/stubRepository#
     * @param {Object} request - The protocol request
     * @param {Object} logger - The logger
     * @param {Object} imposterState - The current state for the imposter
     * @returns {Object} - Promise resolving to the response
     */
    function getResponseFor (request, logger, imposterState) {
        const stub = findFirstMatch(request, logger, imposterState),
            responseConfig = stub.nextResponse();

        logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
        return responseConfig;
    }

    function isRecordedResponse (response) {
        return response.is && response.is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
    }

    /**
    * Removes the saved proxy responses
    */
    function resetProxies () {
        const allStubs = stubs.getAll();
        for (let i = allStubs.length - 1; i >= 0; i -= 1) {
            allStubs[i].deleteResponsesMatching(isRecordedResponse);
            if (allStubs[i].responses.length === 0) {
                stubs.deleteAtIndex(i);
            }
        }
    }

    return {
        stubs: getStubs,
        addStub,
        addStubAtIndex,
        overwriteStubs,
        overwriteStubAtIndex,
        deleteStubAtIndex,
        getResponseFor,
        resetProxies
    };
}

module.exports = { create };
