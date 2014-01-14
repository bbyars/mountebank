'use strict';

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q');

function create (proxy, postProcess) {
    /* jshint unused: false */
    var injectState = {};

    function inject (request, fn, logger) {
        /* jshint evil: true */
        var deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = '(' + fn + ')(scope, injectState, logger, deferred.resolve);';

        try {
            var response = eval(injected);
            if (typeof response !== "undefined") {
                deferred.resolve(response);
            }
        }
        catch (error) {
            logger.error("injection X=> " + error);
            logger.error("    full source: " + JSON.stringify(injected));
            logger.error("    scope: " + JSON.stringify(scope));
            logger.error("    injectState: " + JSON.stringify(injectState));
            deferred.reject(errors.InjectionError('invalid response injection', { source: injected, data: error.message }));
        }
        return deferred.promise;
    }

    function addPredicatesTo (predicates, request, predicatesToRemember) {
        predicatesToRemember.forEach(function (key) {
            if (key.indexOf('.') > 0) {
                var parts = key.split('.'),
                    next = parts[0],
                    rest = parts.slice(1).join('.');
                predicates[next] = {};
                addPredicatesTo(predicates[next], request[next], [rest]);
            }
            else if (typeof request[key] === 'object') {
                predicates[key] = {};
                addPredicatesTo(predicates[key], request[key], Object.keys(request[key]));
            }
            else {
                predicates[key] = { is: request[key] };
            }
        });
    }

    function predicatesFor (request, fieldsToMatch) {
        var result = {};
        Object.keys(fieldsToMatch).forEach(function (key) {
            if (typeof request[key] === 'object') {
                var subMatchers = {};
                Object.keys(request[key]).forEach(function (key) {
                    subMatchers[key] = { matches: true };
                });
                result[key] = predicatesFor(request[key], subMatchers);
            }
            else {
                result[key] = { is: request[key] };
            }
        });
        return result;
    }

    function stubIndexFor (stubResolver, stubs) {
        for (var i = 0; i < stubs.length; i++) {
            var stub = stubs[i];
            if (stub.responses.indexOf(stubResolver) >= 0) {
                break;
            }
        }
        return i;
    }

    function getResolvePromise (stubResolver, request, logger, stubs) {
        /* jshint maxcomplexity: 7 */
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
                addPredicatesTo(stub.predicates, request, stubResolver.proxyAll.remember);
                stubs.unshift(stub);
                return Q(response);
            });
        }
        else if (stubResolver.proxyX) {
            return proxy.to(stubResolver.proxyX.to, request).then(function (response) {
                // if stub exists, add response to end of array
                // search only in direction specified by mode
                // else
                var predicates = predicatesFor(request, stubResolver.proxyX.replayWhen),
                    newStub = { predicates: predicates, responses: [{ is: response }] },
                    index = stubResolver.proxyX.mode === 'proxyAlways' ? stubs.length : stubIndexFor(stubResolver, stubs);

                logger.debug('inserting new stub at index %s: %s', index, JSON.stringify(newStub));
                stubs.splice(index, 0, newStub);
                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, logger).then(function (response) {
                return Q(response);
            });
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized stub resolver', { source: stubResolver }));
        }
    }

    function resolve (stubResolver, request, logger, stubs) {
        return getResolvePromise(stubResolver, request, logger, stubs).then(function (response) {
            return Q(postProcess(response));
        });
    }

    return {
        resolve: resolve
    };
}

module.exports = {
    create: create
};
