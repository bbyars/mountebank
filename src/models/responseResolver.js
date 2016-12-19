'use strict';

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    behaviors = require('./behaviors'),
    Q = require('q'),
    stringify = require('json-stable-stringify');

/**
 * Creates the resolver
 * @param {Object} proxy - The protocol-specific proxy implementation
 * @param {Function} postProcess - The protocol-specific post-processor to add default response values
 * @returns {Object}
 */
function create (proxy, postProcess) {
    var injectState = {};

    function inject (request, fn, logger) {
        var deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = '(' + fn + ')(scope, injectState, logger, deferred.resolve);';

        if (request.isDryRun === true) {
            Q.delay(1).then(function () {
                deferred.resolve({});
            });
        }
        else {
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
                deferred.reject(errors.InjectionError('invalid response injection', {
                    source: injected,
                    data: error.message
                }));
            }
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
        for (var i = 0; i < stubs.length; i += 1) {
            var stub = stubs[i];
            if (stub.responses.indexOf(responseConfig) >= 0) {
                break;
            }
        }
        return i;
    }

    function indexOfStubToAddResponseTo (responseConfig, request, stubs) {
        var predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || []),
            index;

        for (index = stubIndexFor(responseConfig, stubs) + 1; index < stubs.length; index += 1) {
            if (stringify(predicates) === stringify(stubs[index].predicates)) {
                return index;
            }
        }
        return -1;
    }

    function canAddResponseToExistingStub (responseConfig, request, stubs) {
        return indexOfStubToAddResponseTo(responseConfig, request, stubs) >= 0;
    }

    function newIsResponse (response, addWaitBehavior) {
        var result = { is: response };

        if (addWaitBehavior && response._proxyResponseTime) {           // eslint-disable-line no-underscore-dangle
            result._behaviors = { wait: response._proxyResponseTime };  // eslint-disable-line no-underscore-dangle
        }
        return result;
    }

    function addNewResponse (responseConfig, request, response, stubs) {
        var stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior),
            responseIndex = indexOfStubToAddResponseTo(responseConfig, request, stubs);

        stubs[responseIndex].responses.push(stubResponse);
    }

    function addNewStub (responseConfig, request, response, stubs) {
        var predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || []),
            stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior),
            newStub = { predicates: predicates, responses: [stubResponse] },
            index = responseConfig.proxy.mode === 'proxyAlways' ? stubs.length : stubIndexFor(responseConfig, stubs);

        stubs.splice(index, 0, newStub);
    }

    function recordProxyResponse (responseConfig, request, response, stubs) {
        if (['proxyOnce', 'proxyAlways'].indexOf(responseConfig.proxy.mode) < 0) {
            responseConfig.proxy.mode = 'proxyOnce';
        }

        if (responseConfig.proxy.mode === 'proxyAlways' && canAddResponseToExistingStub(responseConfig, request, stubs)) {
            addNewResponse(responseConfig, request, response, stubs);
        }
        else {
            addNewStub(responseConfig, request, response, stubs);
        }
    }

    function shouldDecorate (request, responseConfig) {
        return !request.isDryRun && responseConfig._behaviors && responseConfig._behaviors.decorate;
    }

    function proxyAndRecord (responseConfig, request, logger, stubs) {
        if (responseConfig.proxy && responseConfig.proxy.injectHeaders) {
            for (var key in responseConfig.proxy.injectHeaders) {
                request.headers[key] = responseConfig.proxy.injectHeaders[key];
            }
        }

        return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy).then(function (response) {
            if (!shouldDecorate(request, responseConfig)) {
                return Q(response);
            }

            // Run decorator here to persist decorated response
            return Q(behaviors.decorate(request, Q(response), responseConfig._behaviors.decorate, logger));
        }).then(function (response) {
            recordProxyResponse(responseConfig, request, response, stubs);
            return Q(response);
        });
    }

    function processResponse (responseConfig, request, logger, stubs) {
        if (responseConfig.is) {
            // Clone to prevent accidental state changes downstream
            return Q(helpers.clone(responseConfig.is));
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, logger, stubs);
        }
        else if (responseConfig.inject) {
            return inject(request, responseConfig.inject, logger).then(Q);
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized response type', { source: responseConfig }));
        }
    }

    function hasMultipleTypes (responseConfig) {
        return (responseConfig.is && responseConfig.proxy) ||
               (responseConfig.is && responseConfig.inject) ||
               (responseConfig.proxy && responseConfig.inject);
    }

    /**
     * Resolves a single response
     * @memberOf module:models/responseResolver#
     * @param {Object} responseConfig - The API-provided response configuration
     * @param {Object} request - The protocol-specific request object
     * @param {Object} logger - The logger
     * @param {Object} stubs - The stubs for the imposter
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (responseConfig, request, logger, stubs) {
        if (hasMultipleTypes(responseConfig)) {
            return Q.reject(errors.ValidationError('each response object must have only one response type', { source: responseConfig }));
        }

        return processResponse(responseConfig, request, logger, stubs).then(function (response) {
            // We may have already run the decorator in the proxy call to persist the decorated response
            // in the new stub.  If so, we need to ensure we don't re-run it
            var clonedConfig = helpers.clone(responseConfig);

            if (clonedConfig.proxy && shouldDecorate(request, clonedConfig)) {
                delete clonedConfig._behaviors.decorate;
            }
            return Q(behaviors.execute(request, response, clonedConfig._behaviors, logger));
        }).then(function (response) {
            return Q(postProcess(response, request));
        });
    }

    return {
        resolve: resolve
    };
}

module.exports = {
    create: create
};
