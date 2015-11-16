'use strict';

/**
 * Maintains all stubs for an imposter
 * @module
 */

var predicates = require('./predicates'),
    Q = require('q');

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

    function findFirstMatch (request, logger) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var stubPredicates = stub.predicates || [];
            return trueForAll(stubPredicates, function (predicate) {
                return predicates.resolve(predicate, request, encoding, logger);
            });
        });
        if (matches.length === 0) {
            logger.debug('no predicate match');
            return undefined;
        }
        else {
            logger.debug('using predicate match: ' + JSON.stringify(matches[0].predicates || {}));
            return matches[0];
        }
    }

    /**
     * Adds a stub to the repository
     * @memberOf module:models/stubRepository#
     * @param {Object} stub - The stub to add
     */
    function addStub (stub) {
        stubs.push(stub);
    }

    /**
     * Finds the right stub for a request and generates a response
     * @memberOf module:models/stubRepository#
     * @param {Object} request - The protocol request
     * @param {Object} logger - The logger
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (request, logger) {
        var stub = findFirstMatch(request, logger) || { responses: [{ is: {} }] },
            responseConfig = stub.responses.shift(),
            deferred = Q.defer();

        logger.debug('generating response from ' + JSON.stringify(responseConfig));

        stub.responses.push(responseConfig);

        resolver.resolve(responseConfig, request, logger, stubs).done(function (response) {
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
        stubs: stubs,
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};
