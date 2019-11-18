'use strict';

/**
 * Maintains all stubs for an imposter
 * @module
 */

/**
 * Creates the repository
 * @param {string} encoding - utf8 or base64
 * @returns {Object}
 */
function create (encoding) {
    const stubs = function () {
        const _stubs = []; // eslint-disable-line no-underscore-dangle

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

        function decorate (stub) {
            // TODO: Clone first?
            stub.statefulResponses = repeatTransform(stub.responses);
            stub.addResponse = response => { stub.responses.push(response); };
            stub.nextResponse = () => {
                const helpers = require('../util/helpers'),
                    responseConfig = stub.statefulResponses.shift(),
                    cloned = helpers.clone(responseConfig);

                stub.statefulResponses.push(responseConfig);

                cloned.recordMatch = (request, response) => {
                    const clonedResponse = helpers.clone(response),
                        match = {
                            timestamp: new Date().toJSON(),
                            request,
                            response: clonedResponse
                        };
                    if (helpers.defined(clonedResponse._proxyResponseTime)) { // eslint-disable-line no-underscore-dangle
                        delete clonedResponse._proxyResponseTime; // eslint-disable-line no-underscore-dangle
                    }

                    stub.matches = stub.matches || [];
                    stub.matches.push(match);
                    cloned.recordMatch = () => {}; // Only record once
                };

                cloned.setMetadata = (responseType, metadata) => {
                    Object.keys(metadata).forEach(key => {
                        responseConfig[responseType][key] = metadata[key];
                        cloned[responseType][key] = metadata[key];
                    });
                };
                return cloned;
            };
            return stub;
        }

        function first (filter) {
            return _stubs.find(filter);
        }

        function add (stub) {
            _stubs.push(decorate(stub));
        }

        function insertBefore (stub, filter) {
            for (var i = 0; i < _stubs.length; i += 1) {
                if (filter(_stubs[i])) {
                    break;
                }
            }
            _stubs.splice(i, 0, decorate(stub));
        }

        function insertAtIndex (stub, index) {
            _stubs.splice(index, 0, decorate(stub));
        }

        function overwriteAll (newStubs) {
            while (_stubs.length > 0) {
                _stubs.pop();
            }
            newStubs.forEach(stub => add(stub));
        }

        function overwriteAtIndex (newStub, index) {
            _stubs[index] = decorate(newStub);
        }

        function deleteAtIndex (index) {
            _stubs.splice(index, 1);
        }

        function getAll () {
            const helpers = require('../util/helpers'),
                result = helpers.clone(_stubs);

            for (var i = 0; i < _stubs.length; i += 1) {
                delete result[i].statefulResponses;
                const stub = _stubs[i];

                result[i].addResponse = response => {
                    stub.responses.push(response);
                };
            }
            return result;
        }

        return {
            count: () => _stubs.length,
            first,
            add,
            insertBefore,
            insertAtIndex,
            overwriteAll,
            overwriteAtIndex,
            deleteAtIndex,
            getAll
        };
    }();

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
        const defaultResponse = { is: {} },
            defaultStub = { nextResponse: () => defaultResponse };

        defaultResponse.recordMatch = () => {};
        defaultResponse.setMetadata = () => {};

        if (stubs.count() === 0) {
            return defaultStub;
        }

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
            return defaultStub;
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

    /**
    * Removes the saved proxy responses
    */
    function resetProxies () {
        const allStubs = stubs.getAll();
        for (let i = allStubs.length - 1; i >= 0; i -= 1) {
            // TODO: Decorate responses?
            allStubs[i].responses = allStubs[i].responses.filter(response => {
                if (!response.is) {
                    return true;
                }
                return typeof response.is._proxyResponseTime === 'undefined'; // eslint-disable-line no-underscore-dangle
            });
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
