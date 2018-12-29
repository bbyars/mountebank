'use strict';

/**
 * Maintains all stubs for an imposter
 * @module
 */

/**
 * Creates the repository
 * @param {module:models/responseResolver} resolver - The response resolver
 * @param {boolean} recordMatches - Whether to record matches (the --debug command line flag)
 * @param {string} encoding - utf8 or base64
 * @returns {Object}
 */
function create (resolver, recordMatches, encoding) {
    /**
     * The list of stubs within this repository
     * @memberOf module:models/stubRepository#
     * @type {Array}
     */
    const stubs = [];

    // we call map before calling every so we make sure to call every
    // predicate during dry run validation rather than short-circuiting
    function trueForAll (list, predicate) {
        return list.map(predicate).every(result => result);
    }

    function findFirstMatch (request, logger, imposterState) {
        const helpers = require('../util/helpers');

        if (stubs.length === 0) {
            return undefined;
        }
        const matches = stubs.filter(stub => {
            const stubPredicates = stub.predicates || [],
                predicates = require('./predicates');

            return trueForAll(stubPredicates, predicate => predicates.evaluate(predicate, request, encoding, logger, imposterState));
        });
        if (matches.length === 0) {
            logger.debug('no predicate match');
            return undefined;
        }
        else {
            logger.debug(`using predicate match: ${JSON.stringify(matches[0].predicates || {})}`);
            if (!helpers.defined(matches[0].statefulResponses)) {
                // This happens when the responseResolver adds a stub, but doesn't know about this hidden state
                matches[0].statefulResponses = matches[0].responses;
            }
            return matches[0];
        }
    }

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

    /**
     * Adds a stub to the repository
     * @memberOf module:models/stubRepository#
     * @param {Object} stub - The stub to add
     */
    function addStub (stub) {
        stub.statefulResponses = repeatTransform(stub.responses);
        stubs.push(stub);
    }

    /**
     * Returns the outside representation of the stubs
     * @memberOf module:models/stubRepository#
     * @returns {Object} - The stubs
     */
    function getStubs () {
        const helpers = require('../util/helpers'),
            result = helpers.clone(stubs);

        result.forEach(stub => {
            delete stub.statefulResponses;
        });
        return result;
    }

    /**
     * Finds the right stub for a request and generates a response
     * @memberOf module:models/stubRepository#
     * @param {Object} request - The protocol request
     * @param {Object} logger - The logger
     * @param {Object} imposterState - The current state for the imposter
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (request, logger, imposterState) {
        const stub = findFirstMatch(request, logger, imposterState) || { statefulResponses: [{ is: {} }] },
            responseConfig = stub.statefulResponses.shift();

        logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);

        stub.statefulResponses.push(responseConfig);

        return resolver.resolve(responseConfig, request, logger, stubs, imposterState).then(response => {
            const match = { timestamp: new Date().toJSON(), request, response };
            if (recordMatches) {
                stub.matches = stub.matches || [];
                stub.matches.push(match);
            }
            return response;
        });
    }

    /**
    * Removes the saved proxy responses
    */
    function resetProxies () {
        for (let i = stubs.length - 1; i >= 0; i -= 1) {
            stubs[i].responses = stubs[i].responses.filter(response => {
                if (!response.is) {
                    return true;
                }
                return typeof response.is._proxyResponseTime === 'undefined'; // eslint-disable-line no-underscore-dangle
            });
            if (stubs[i].responses.length === 0) {
                stubs.splice(i, 1);
            }
        }
    }

    return { stubs: getStubs, addStub, resolve, resetProxies };
}

module.exports = { create };
