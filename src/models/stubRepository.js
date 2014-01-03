'use strict';

var predicates = require('./predicates'),
    Q = require('q'),
    util = require('util'),
    errors = require('../errors/errors'),
    helpers = require('../util/helpers');

function create (proxy, postProcess) {
    var stubs = [],
        injectState = {};

    function trueForAll (obj, predicate) {
        // we call map before calling every so we make sure to call every
        // predicate during dry run validation rather than short-circuiting
        return Object.keys(obj).map(predicate).every(function (result) { return result; });
    }

    function matchesPredicate (fieldName, predicate, request) {
        if (typeof predicate !== 'object' || util.isArray(predicate)) {
            throw errors.ValidationError('predicate must be an object', { source: predicate });
        }

        return trueForAll(predicate, function (key) {
            if (predicates[key]) {
                return predicates[key](fieldName, predicate[key], request);
            }
            else if (typeof predicate[key] === 'object') {
                return matchesPredicate(fieldName + '.' + key, predicate[key], request);
            }
            else {
                throw errors.ValidationError("no predicate '" + key + "'", { source: predicate });
            }
        });
    }

    function findFirstMatch (request, logger) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var predicates = stub.predicates || {};
            return trueForAll(predicates, function (fieldName) {
                return matchesPredicate(fieldName, predicates[fieldName], request);
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

    function inject (request, fn, state, logger) {
        /* jshint evil: true, unused: false */
        var deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = 'try {\n' +
                '    var response = (' + fn + ')(scope, state, deferred.resolve);\n' +
                '    if (response) { deferred.resolve(response); }\n' +
                '}\n' +
                'catch (error) {\n' +
                '    logger.error("injection X=> " + error);\n' +
                '    logger.error("    source: " + JSON.stringify(injected));\n' +
                '    logger.error("    scope: " + JSON.stringify(scope));\n' +
                '    logger.error("    state: " + JSON.stringify(state));\n' +
                '    deferred.reject(error);\n' +
                '}';
        eval(injected);
        return deferred.promise;
    }

    function getResolvedResponsePromise (stubResolver, request, logger) {
        /* jshint maxcomplexity: 6 */
        logger.debug('using stub resolver ' + JSON.stringify(stubResolver));

        if (stubResolver.is) {
            return Q(stubResolver.is);
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy.to, request);
        }
        else if (stubResolver.proxyOnce) {
            return proxy.to(stubResolver.proxyOnce.to, request).then(function (response) {
                stubResolver.is = response;
                return Q(response);
            });
        }
        else if (stubResolver.proxyAll) {
            return proxy.to(stubResolver.proxyAll.to, request).then(function (response) {
                var stub = { predicates: {}, responses: [{ is: response }] };
                stubResolver.proxyAll.remember.forEach(function (key) {
                    stub.predicates[key] = { is: request[key] };
                });
                stubs.unshift(stub);
                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, injectState, logger).then(function (response) {
                return Q(response);
            });
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized stub resolver', { source: stubResolver }));
        }
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request, logger) {
        var stub = findFirstMatch(request, logger) || { responses: [{ is: {} }]},
            stubResolver = stub.responses.shift(),
            deferred = Q.defer();

        stub.responses.push(stubResolver);

        getResolvedResponsePromise(stubResolver, request, logger).done(function (stubResponse) {
            var response = postProcess(stubResponse),
                match = {
                    timestamp: new Date().toJSON(),
                    request: request,
                    response: response
                };
            stub.matches = stub.matches || [];
            stub.matches.push(match);
            deferred.resolve(response);
        }, deferred.reject);

        return deferred.promise;
    }

    return {
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};
