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

        if (match.success) {
            logger.debug(`using predicate match: ${JSON.stringify(match.stub.predicates || {})}`);
        }
        else {
            logger.debug('no predicate match');
        }
        return match;
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
        const match = findFirstMatch(request, logger, imposterState),
            responseConfig = match.stub.nextResponse();

        logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
        responseConfig.stubIndex = () => match.index;
        return responseConfig;
    }

    function isRecordedResponse (response) {
        return response.is && response.is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
    }

    /**
    * Removes the saved proxy responses
    * @returns {Object} - Promise
    */
    function resetProxies () {
        return stubs.all().then(allStubs => {
            for (let i = allStubs.length - 1; i >= 0; i -= 1) {
                allStubs[i].deleteResponsesMatching(isRecordedResponse);
                if (allStubs[i].responses.length === 0) {
                    stubs.deleteAtIndex(i);
                }
            }
        });
    }

    return {
        all: stubs.all,
        add: stubs.add,
        insertAtIndex: stubs.insertAtIndex,
        overwriteAll: stubs.overwriteAll,
        overwriteAtIndex: stubs.overwriteAtIndex,
        deleteAtIndex: stubs.deleteAtIndex,
        getResponseFor,
        resetProxies
    };
}

module.exports = { create };
