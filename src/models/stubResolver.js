'use strict';

var helpers = require('../util/helpers'),
    combinators = require('../util/combinators'),
    errors = require('../util/errors'),
    Q = require('q'),
    stringify = require('json-stable-stringify');

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

    function buildEquals (request, matchers) {
        var result = {};
        Object.keys(matchers).forEach(function (key) {
            if (typeof request[key] === 'object') {
                result[key] = buildEquals(request[key], matchers[key]);
            }
            else {
                result[key] = request[key];
            }
        });
        return result;
    }

    function predicatesFor (request, matchers) {
        var deepEquals = {},
            equals = {},
            result = [],
            isEmpty = function (obj) { return JSON.stringify(obj) === '{}'; };

        if (matchers.length === 0) {
            return [];
        }

        matchers.forEach(function (matcher) {
            Object.keys(matcher.matches).forEach(function (fieldName) {
                var value = matcher.matches[fieldName];

                if (value === true) {
                    deepEquals[fieldName] = request[fieldName];
                }
                else {
                    equals[fieldName] = buildEquals(request[fieldName], value);
                }
            });
        });

        if (!isEmpty(deepEquals)) {
            result.push({ deepEquals: deepEquals });
        }
        if (!isEmpty(equals)) {
            result.push({ equals: equals });
        }
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

    function proxyAndRecord (stubResolver, request, stubs) {
        /* jshint maxcomplexity: 6 */
        return proxy.to(stubResolver.proxy.to, request).then(function (response) {
            var predicates = predicatesFor(request, stubResolver.proxy.replayWhen || []),
                stubResponse = { is: response },
                newStub = { predicates: predicates, responses: [stubResponse] },
                index = stubIndexFor(stubResolver, stubs);

            if (['proxyOnce', 'proxyAlways'].indexOf(stubResolver.proxy.mode) < 0) {
                stubResolver.proxy.mode = 'proxyOnce';
            }

            if (stubResolver.proxy.mode === 'proxyAlways') {
                for (index = index + 1; index < stubs.length; index++) {
                    if (stringify(predicates) === stringify(stubs[index].predicates)) {
                        stubs[index].responses.push(stubResponse);
                        return Q(response);
                    }
                }
            }

            stubs.splice(index, 0, newStub);
            return Q(response);
        });
    }

    function process (stubResolver, request, logger, stubs) {
        if (stubResolver.is) {
            return Q(stubResolver.is);
        }
        else if (stubResolver.proxy) {
            return proxyAndRecord(stubResolver, request, stubs);
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, logger).then(Q);
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized stub resolver', { source: stubResolver }));
        }
    }

    function resolve (stubResolver, request, logger, stubs) {
        var postProcessAndReturnPromise = combinators.compose(Q, postProcess);
        return process(stubResolver, request, logger, stubs).then(postProcessAndReturnPromise);
    }

    return {
        resolve: resolve
    };
}

module.exports = {
    create: create
};
