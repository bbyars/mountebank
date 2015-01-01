'use strict';

var predicates = require('./predicates'),
    Q = require('q');

function create (resolver, recordMatches, encoding) {
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

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request, logger) {
        var stub = findFirstMatch(request, logger) || { responses: [{ is: {} }]},
            stubResolver = stub.responses.shift(),
            deferred = Q.defer();

        logger.debug('using stub resolver ' + JSON.stringify(stubResolver));

        stub.responses.push(stubResolver);

        resolver.resolve(stubResolver, request, logger, stubs).done(function (response) {
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
