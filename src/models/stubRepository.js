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
            filter = stub => {
                const stubPredicates = stub.predicates || [],
                    predicates = require('./predicates');

                return trueForAll(stubPredicates,
                    predicate => predicates.evaluate(predicate, request, encoding, logger, readOnlyState),
                    request.isDryRun === true);
            };

        return stubs.first(filter).then(match => {
            if (match.success) {
                logger.debug(`using predicate match: ${JSON.stringify(match.stub.predicates || {})}`);
            }
            else {
                logger.debug('no predicate match');
            }
            return match;
        });
    }

    function getResponseFor (request, logger, imposterState) {
        return findFirstMatch(request, logger, imposterState).then(match => {
            const responseConfig = match.stub.nextResponse();

            logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
            responseConfig.stubIndex = () => match.index;
            return responseConfig;
        });
    }

    return {
        all: stubs.all,
        add: stubs.add,
        insertAtIndex: stubs.insertAtIndex,
        overwriteAll: stubs.overwriteAll,
        overwriteAtIndex: stubs.overwriteAtIndex,
        deleteAtIndex: stubs.deleteAtIndex,
        getResponseFor
    };
}

module.exports = { create };
