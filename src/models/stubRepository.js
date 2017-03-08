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
    var stubs = [];

    function trueForAll (list, predicate) {
        // we call map before calling every so we make sure to call every
        // predicate during dry run validation rather than short-circuiting
        return list.map(predicate).every(function (result) { return result; });
    }

    function findFirstMatch (request, logger, imposterState) {
        var helpers = require('../util/helpers');

        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var stubPredicates = stub.predicates || [],
                predicates = require('./predicates');

            return trueForAll(stubPredicates, function (predicate) {
                return predicates.evaluate(predicate, request, encoding, logger, imposterState);
            });
        });
        if (matches.length === 0) {
            logger.debug('no predicate match');
            return undefined;
        }
        else {
            logger.debug('using predicate match: ' + JSON.stringify(matches[0].predicates || {}));
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
        var result = [],
            response,
            repeats;

        for (var i = 0; i < responses.length; i += 1) {
            response = responses[i];
            repeats = repeatsFor(response);
            for (var j = 0; j < repeats; j += 1) {
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
        var helpers = require('../util/helpers'),
            result = helpers.clone(stubs);

        result.forEach(function (stub) {
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
        var stub = findFirstMatch(request, logger, imposterState) || { statefulResponses: [{ is: {} }] },
            responseConfig = stub.statefulResponses.shift(),
            Q = require('q'),
            deferred = Q.defer();

        logger.debug('generating response from ' + JSON.stringify(responseConfig));

        stub.statefulResponses.push(responseConfig);

        resolver.resolve(responseConfig, request, logger, stubs, imposterState).done(function (response) {
            var match = {
                timestamp: new Date().toJSON(),
                request: request,
                response: response
            };
            if (recordMatches) {
                stub.matches = stub.matches || [];
                stub.matches.push(match);
            }
            deferred.resolve(response);
        }, deferred.reject);

        return deferred.promise;
    }

    return {
        stubs: getStubs,
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};
