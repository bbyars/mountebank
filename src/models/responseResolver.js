'use strict';

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

/**
 * Creates the resolver
 * @param {Object} proxy - The protocol-specific proxy implementation
 * @param {Function} postProcess - The protocol-specific post-processor to add default response values
 * @returns {Object}
 */
function create (proxy, postProcess) {
    var injectState = {};

    function inject (request, fn, logger, imposterState) {
        var Q = require('q'),
            helpers = require('../util/helpers'),
            deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = '(' + fn + ')(scope, injectState, logger, deferred.resolve, imposterState);',
            exceptions = require('../util/errors');

        if (request.isDryRun === true) {
            Q.delay(1).then(function () {
                deferred.resolve({});
            });
        }
        else {
            try {
                var response = eval(injected);
                if (helpers.defined(response)) {
                    deferred.resolve(response);
                }
            }
            catch (error) {
                logger.error('injection X=> ' + error);
                logger.error('    full source: ' + JSON.stringify(injected));
                logger.error('    scope: ' + JSON.stringify(scope));
                logger.error('    injectState: ' + JSON.stringify(injectState));
                logger.error('    imposterState: ' + JSON.stringify(imposterState));
                deferred.reject(exceptions.InjectionError('invalid response injection', {
                    source: injected,
                    data: error.message
                }));
            }
        }
        return deferred.promise;
    }

    function selectionValue (nodes) {
        var helpers = require('../util/helpers');
        if (!helpers.defined(nodes)) {
            return '';
        }
        else if (!Array.isArray(nodes)) {
            return nodes; // booleans and counts
        }
        else {
            return (nodes.length === 1) ? nodes[0] : nodes;
        }
    }

    function xpathValue (xpathConfig, possibleXML, logger) {
        var xpath = require('./xpath'),
            nodes = xpath.select(xpathConfig.selector, xpathConfig.ns, possibleXML, logger);
        return selectionValue(nodes);
    }

    function jsonpathValue (jsonpathConfig, possibleJSON, logger) {
        var jsonpath = require('./jsonpath'),
            nodes = jsonpath.select(jsonpathConfig.selector, possibleJSON, logger);
        return selectionValue(nodes);
    }

    function buildEquals (request, matchers, valueOf) {
        var result = {};
        Object.keys(matchers).forEach(function (key) {
            if (typeof request[key] === 'object') {
                result[key] = buildEquals(request[key], matchers[key], valueOf);
            }
            else {
                result[key] = valueOf(request[key]);
            }
        });
        return result;
    }

    function predicatesFor (request, matchers, logger) {
        var predicates = [];

        matchers.forEach(function (matcher) {
            var basePredicate = {},
                valueOf = function (field) { return field; };

            // Add parameters
            Object.keys(matcher).forEach(function (key) {
                if (key !== 'matches') {
                    basePredicate[key] = matcher[key];
                }
                if (key === 'xpath') {
                    valueOf = function (field) { return xpathValue(matcher.xpath, field, logger); };
                }
                else if (key === 'jsonpath') {
                    valueOf = function (field) { return jsonpathValue(matcher.jsonpath, field, logger); };
                }
            });

            Object.keys(matcher.matches).forEach(function (fieldName) {
                var helpers = require('../util/helpers'),
                    matcherValue = matcher.matches[fieldName],
                    predicate = helpers.clone(basePredicate);

                if (matcherValue === true) {
                    predicate.deepEquals = {};
                    predicate.deepEquals[fieldName] = valueOf(request[fieldName]);
                }
                else {
                    predicate.equals = {};
                    predicate.equals[fieldName] = buildEquals(request[fieldName], matcherValue, valueOf);
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

    function indexOfStubToAddResponseTo (responseConfig, request, stubs, logger) {
        var predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stringify = require('json-stable-stringify');

        for (var index = stubIndexFor(responseConfig, stubs) + 1; index < stubs.length; index += 1) {
            if (stringify(predicates) === stringify(stubs[index].predicates)) {
                return index;
            }
        }
        return -1;
    }

    function canAddResponseToExistingStub (responseConfig, request, stubs, logger) {
        return indexOfStubToAddResponseTo(responseConfig, request, stubs, logger) >= 0;
    }

    function newIsResponse (response, addWaitBehavior, addDecorateBehavior) {
        var result = { is: response };
        var addBehaviors = {};

        if (addWaitBehavior && response._proxyResponseTime) { // eslint-disable-line no-underscore-dangle
            addBehaviors.wait = response._proxyResponseTime; // eslint-disable-line no-underscore-dangle
        }
        if (addDecorateBehavior) {
            addBehaviors.decorate = addDecorateBehavior;
        }

        if (Object.keys(addBehaviors).length) {
            result._behaviors = addBehaviors;
        }
        return result;
    }

    function addNewResponse (responseConfig, request, response, stubs, logger) {
        var stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior, responseConfig.proxy.addDecorateBehavior),
            responseIndex = indexOfStubToAddResponseTo(responseConfig, request, stubs, logger);

        stubs[responseIndex].responses.push(stubResponse);
    }

    function addNewStub (responseConfig, request, response, stubs, logger) {
        var predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior, responseConfig.proxy.addDecorateBehavior),
            newStub = { predicates: predicates, responses: [stubResponse] },
            index = responseConfig.proxy.mode === 'proxyAlways' ? stubs.length : stubIndexFor(responseConfig, stubs);

        stubs.splice(index, 0, newStub);
    }

    function recordProxyResponse (responseConfig, request, response, stubs, logger) {
        // proxyTransparent prevents the request from being recorded, and always transparently issues the request.
        if ('proxyTransparent' == responseConfig.proxy.mode) {
            return;
        }

        if (['proxyOnce', 'proxyAlways'].indexOf(responseConfig.proxy.mode) < 0) {
            responseConfig.proxy.mode = 'proxyOnce';
        }

        if (responseConfig.proxy.mode === 'proxyAlways' && canAddResponseToExistingStub(responseConfig, request, stubs)) {
            addNewResponse(responseConfig, request, response, stubs, logger);
        }
        else {
            addNewStub(responseConfig, request, response, stubs, logger);
        }
    }

    // TODO: HTTP-specific, any way to move out of here?
    function addInjectedHeadersTo (request, headersToInject) {
        Object.keys(headersToInject || {}).forEach(function (key) {
            request.headers[key] = headersToInject[key];
        });
    }

    function proxyAndRecord (responseConfig, request, logger, stubs) {
        var Q = require('q'),
            behaviors = require('./behaviors');

        addInjectedHeadersTo(request, responseConfig.proxy.injectHeaders);

        return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy).then(function (response) {
            // Run behaviors here to persist decorated response
            return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
        }).then(function (response) {
            recordProxyResponse(responseConfig, request, response, stubs, logger);
            return Q(response);
        });
    }

    function processResponse (responseConfig, request, logger, stubs, imposterState) {
        var Q = require('q'),
            helpers = require('../util/helpers'),
            exceptions = require('../util/errors');

        if (responseConfig.is) {
            // Clone to prevent accidental state changes downstream
            return Q(helpers.clone(responseConfig.is));
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, logger, stubs);
        }
        else if (responseConfig.inject) {
            return inject(request, responseConfig.inject, logger, imposterState).then(Q);
        }
        else {
            return Q.reject(exceptions.ValidationError('unrecognized response type', { source: responseConfig }));
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
     * @param {Object} imposterState - The current state for the imposter
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (responseConfig, request, logger, stubs, imposterState) {
        var Q = require('q'),
            exceptions = require('../util/errors'),
            helpers = require('../util/helpers'),
            behaviors = require('./behaviors');

        if (hasMultipleTypes(responseConfig)) {
            return Q.reject(exceptions.ValidationError('each response object must have only one response type',
                { source: responseConfig }));
        }

        return processResponse(responseConfig, helpers.clone(request), logger, stubs, imposterState).then(function (response) {
            // We may have already run the behaviors in the proxy call to persist the decorated response
            // in the new stub. If so, we need to ensure we don't re-run it
            if (responseConfig.proxy) {
                return Q(response);
            }
            else {
                return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
            }
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
