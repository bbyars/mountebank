'use strict';

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    behaviors = require('./behaviors'),
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
            if (typeof response !== 'undefined') {
                deferred.resolve(response);
            }
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    scope: ' + JSON.stringify(scope));
            logger.error('    injectState: ' + JSON.stringify(injectState));
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
        var predicates = [];

        matchers.forEach(function (matcher) {
            var basePredicate = {};

            // Add parameters
            Object.keys(matcher).forEach(function (key) {
                if (key !== 'matches') {
                    basePredicate[key] = matcher[key];
                }
            });

            Object.keys(matcher.matches).forEach(function (fieldName) {
                var value = matcher.matches[fieldName],
                    predicate = helpers.clone(basePredicate);

                if (value === true) {
                    predicate.deepEquals = {};
                    predicate.deepEquals[fieldName] = request[fieldName];
                }
                else {
                    predicate.equals = {};
                    predicate.equals[fieldName] = buildEquals(request[fieldName], value);
                }

                predicates.push(predicate);
            });
        });

        return predicates;
    }

    function stubIndexFor (responseConfig, stubs) {
        for (var i = 0; i < stubs.length; i++) {
            var stub = stubs[i];
            if (stub.responses.indexOf(responseConfig) >= 0) {
                break;
            }
        }
        return i;
    }

    function proxyAndRecord (responseConfig, request, stubs) {
        /* jshint maxcomplexity: 6 */
        return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy).then(function (response) {
            var predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || []),
                stubResponse = { is: response },
                newStub = { predicates: predicates, responses: [stubResponse] },
                index = stubIndexFor(responseConfig, stubs);

            if (['proxyOnce', 'proxyAlways'].indexOf(responseConfig.proxy.mode) < 0) {
                responseConfig.proxy.mode = 'proxyOnce';
            }

            if (responseConfig.proxy.mode === 'proxyAlways') {
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

    function process (responseConfig, request, logger, stubs) {
        if (responseConfig.is) {
            return Q(responseConfig.is);
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, stubs);
        }
        else if (responseConfig.inject) {
            return inject(request, responseConfig.inject, logger).then(Q);
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized response type', { source: responseConfig }));
        }
    }

    function resolve (responseConfig, request, logger, stubs) {
        return process(responseConfig, request, logger, stubs).then(function (response) {
            return Q(postProcess(response, request));
        }).then(function (response) {
            return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
        });
    }

    return {
        resolve: resolve
    };
}

module.exports = {
    create: create
};
