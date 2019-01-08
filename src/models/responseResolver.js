'use strict';

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

/**
 * Creates the resolver
 * @param {Object} proxy - The protocol-specific proxy implementation
 * @param {String} callbackUrl - The protocol callback URL for response resolution
 * @returns {Object}
 */
function create (proxy, callbackUrl) {
    const injectState = {},
        pendingProxyResolutions = {};
    let nextProxyResolutionKey = 0;

    function inject (request, fn, logger, imposterState) {
        const Q = require('q'),
            helpers = require('../util/helpers'),
            deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = `(${fn})(scope, injectState, logger, deferred.resolve, imposterState);`,
            exceptions = require('../util/errors');

        if (request.isDryRun === true) {
            Q.delay(1).then(() => {
                deferred.resolve({});
            });
        }
        else {
            try {
                const response = eval(injected);
                if (helpers.defined(response)) {
                    deferred.resolve(response);
                }
            }
            catch (error) {
                logger.error(`injection X=> ${error}`);
                logger.error(`    full source: ${JSON.stringify(injected)}`);
                logger.error(`    scope: ${JSON.stringify(scope)}`);
                logger.error(`    injectState: ${JSON.stringify(injectState)}`);
                logger.error(`    imposterState: ${JSON.stringify(imposterState)}`);
                deferred.reject(exceptions.InjectionError('invalid response injection', {
                    source: injected,
                    data: error.message
                }));
            }
        }
        return deferred.promise;
    }

    function selectionValue (nodes) {
        const helpers = require('../util/helpers');
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
        const xpath = require('./xpath'),
            nodes = xpath.select(xpathConfig.selector, xpathConfig.ns, possibleXML, logger);
        return selectionValue(nodes);
    }

    function jsonpathValue (jsonpathConfig, possibleJSON, logger) {
        const jsonpath = require('./jsonpath'),
            nodes = jsonpath.select(jsonpathConfig.selector, possibleJSON, logger);
        return selectionValue(nodes);
    }

    function buildEquals (request, matchers, valueOf) {
        const result = {};
        Object.keys(matchers).forEach(key => {
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
        const predicates = [];

        matchers.forEach(matcher => {
            const basePredicate = {};
            let valueOf = field => field;

            // Add parameters
            Object.keys(matcher).forEach(key => {
                if (key !== 'matches') {
                    basePredicate[key] = matcher[key];
                }
                if (key === 'xpath') {
                    valueOf = field => xpathValue(matcher.xpath, field, logger);
                }
                else if (key === 'jsonpath') {
                    valueOf = field => jsonpathValue(matcher.jsonpath, field, logger);
                }
            });

            Object.keys(matcher.matches).forEach(fieldName => {
                const helpers = require('../util/helpers'),
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
            const stub = stubs[i];
            if (stub.responses.indexOf(responseConfig) >= 0) {
                break;
            }
        }
        return i;
    }

    function indexOfStubToAddResponseTo (responseConfig, request, stubs, logger) {
        const predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stringify = require('json-stable-stringify');

        for (let index = stubIndexFor(responseConfig, stubs) + 1; index < stubs.length; index += 1) {
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
        const result = { is: response };
        const addBehaviors = {};

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

    // TODO: Make function on stubRepository
    function addNewResponse (responseConfig, request, response, stubs, logger) {
        const stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior, responseConfig.proxy.addDecorateBehavior),
            responseIndex = indexOfStubToAddResponseTo(responseConfig, request, stubs, logger);

        stubs[responseIndex].responses.push(stubResponse);
    }

    // TODO: Make function on stubRepository
    function addNewStub (responseConfig, request, response, stubs, logger) {
        const predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stubResponse = newIsResponse(response, responseConfig.proxy.addWaitBehavior, responseConfig.proxy.addDecorateBehavior),
            newStub = { predicates: predicates, responses: [stubResponse] },
            index = responseConfig.proxy.mode === 'proxyAlways' ? stubs.length : stubIndexFor(responseConfig, stubs);

        stubs.splice(index, 0, newStub);
    }

    function recordProxyResponse (responseConfig, request, response, stubs, logger) {
        // proxyTransparent prevents the request from being recorded, and always transparently issues the request.
        if (responseConfig.proxy.mode === 'proxyTransparent') {
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
        Object.keys(headersToInject || {}).forEach(key => {
            request.headers[key] = headersToInject[key];
        });
    }

    function proxyAndRecord (responseConfig, request, logger, stubs) {
        const Q = require('q'),
            behaviors = require('./behaviors');

        addInjectedHeadersTo(request, responseConfig.proxy.injectHeaders);

        if (proxy) {
            return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy).then(response =>
                // Run behaviors here to persist decorated response
                Q(behaviors.execute(request, response, responseConfig._behaviors, logger))
            ).then(response => {
                recordProxyResponse(responseConfig, request, response, stubs, logger);
                return Q(response);
            });
        }
        else {
            pendingProxyResolutions[nextProxyResolutionKey] = {
                responseConfig: responseConfig,
                request: request,
                startTime: new Date()
            };
            nextProxyResolutionKey += 1;
            return Q({
                proxy: responseConfig.proxy,
                request: request,
                callbackUrl: `${callbackUrl}/${nextProxyResolutionKey - 1}`
            });
        }
    }

    function processResponse (responseConfig, request, logger, stubs, imposterState) {
        const Q = require('q'),
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
        const Q = require('q'),
            exceptions = require('../util/errors'),
            helpers = require('../util/helpers'),
            behaviors = require('./behaviors');

        if (hasMultipleTypes(responseConfig)) {
            return Q.reject(exceptions.ValidationError('each response object must have only one response type',
                { source: responseConfig }));
        }

        return processResponse(responseConfig, helpers.clone(request), logger, stubs, imposterState).then(response => {
            // We may have already run the behaviors in the proxy call to persist the decorated response
            // in the new stub. If so, we need to ensure we don't re-run it
            if (responseConfig.proxy) {
                return Q(response);
            }
            else {
                return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
            }
        }).then(response => {
            if (proxy) {
                return Q(response);
            }
            else {
                return responseConfig.proxy ? Q(response) : Q({ response });
            }
        });
    }

    /**
     * Finishes the protocol implementation dance for proxy. On the first call,
     * mountebank selects a JSON proxy response and sends it to the protocol implementation,
     * saving state indexed by proxyResolutionKey. The protocol implementation sends the proxy
     * to the downstream system and calls mountebank again with the response so mountebank
     * can save it and add behaviors
     * @param {Object} proxyResponse - the proxy response from the protocol implementation
     * @param {Number} proxyResolutionKey - the key into the saved proxy state
     * @param {Object} stubs - The stubs for the imposter
     * @param {Object} logger - the logger
     * @returns {Object} - Promise resolving to the response
     */
    function resolveProxy (proxyResponse, proxyResolutionKey, stubs, logger) {
        const pendingProxyConfig = pendingProxyResolutions[proxyResolutionKey],
            behaviors = require('./behaviors'),
            Q = require('q');

        // TODO: Capture start time in pendingProxyConfig and add _proxyResponseTime if missing
        return behaviors.execute(pendingProxyConfig.request, proxyResponse, pendingProxyConfig.responseConfig._behaviors, logger)
            .then(response => {
                recordProxyResponse(pendingProxyConfig.responseConfig, pendingProxyConfig.request, response, stubs, logger);
                delete pendingProxyResolutions[proxyResolutionKey];
                return Q(response);
            });
    }

    return { resolve, resolveProxy };
}

module.exports = { create };
