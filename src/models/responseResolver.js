'use strict';

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

/**
 * Creates the resolver
 * @param {Object} stubs - The stubs repository
 * @param {Object} proxy - The protocol-specific proxy implementation
 * @param {String} callbackUrl - The protocol callback URL for response resolution
 * @returns {Object}
 */
function create (stubs, proxy, callbackUrl) {
    const injectState = {},
        pendingProxyResolutions = {},
        inProcessProxy = Boolean(proxy);
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

    function deepEqual (obj1, obj2) {
        return JSON.stringify(obj1) === JSON.stringify(obj2);
    }

    function stubIndexFor (responseConfig) {
        const stubList = stubs.stubs();
        for (var i = 0; i < stubList.length; i += 1) {
            if (stubList[i].responses.some(response => deepEqual(response, responseConfig))) {
                break;
            }
        }
        return i;
    }

    function indexOfStubToAddResponseTo (responseConfig, request, logger) {
        const predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stubList = stubs.stubs();

        for (let index = stubIndexFor(responseConfig) + 1; index < stubList.length; index += 1) {
            if (deepEqual(predicates, stubList[index].predicates)) {
                return index;
            }
        }
        return -1;
    }

    function canAddResponseToExistingStub (responseConfig, request, logger) {
        return indexOfStubToAddResponseTo(responseConfig, request, logger) >= 0;
    }

    function newIsResponse (response, proxyConfig) {
        const result = { is: response };
        const addBehaviors = {};

        if (proxyConfig.addWaitBehavior && response._proxyResponseTime) { // eslint-disable-line no-underscore-dangle
            addBehaviors.wait = response._proxyResponseTime; // eslint-disable-line no-underscore-dangle
        }
        if (proxyConfig.addDecorateBehavior) {
            addBehaviors.decorate = proxyConfig.addDecorateBehavior;
        }

        if (Object.keys(addBehaviors).length) {
            result._behaviors = addBehaviors;
        }
        return result;
    }

    function addNewResponse (responseConfig, request, response, logger) {
        const stubResponse = newIsResponse(response, responseConfig.proxy),
            responseIndex = indexOfStubToAddResponseTo(responseConfig, request, logger);

        stubs.stubs()[responseIndex].addResponse(stubResponse);
    }

    function addNewStub (responseConfig, request, response, logger) {
        const predicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            stubResponse = newIsResponse(response, responseConfig.proxy),
            newStub = { predicates: predicates, responses: [stubResponse] };

        if (responseConfig.proxy.mode === 'proxyAlways') {
            stubs.addStub(newStub);
        }
        else {
            stubs.addStub(newStub, responseConfig);
        }
    }

    function recordProxyResponse (responseConfig, request, response, logger) {
        // proxyTransparent prevents the request from being recorded, and always transparently issues the request.
        if (responseConfig.proxy.mode === 'proxyTransparent') {
            return;
        }

        if (responseConfig.proxy.mode === 'proxyAlways' && canAddResponseToExistingStub(responseConfig, request, logger)) {
            addNewResponse(responseConfig, request, response, logger);
        }
        else {
            addNewStub(responseConfig, request, response, logger);
        }
    }

    // TODO: HTTP-specific, any way to move out of here?
    function addInjectedHeadersTo (request, headersToInject) {
        Object.keys(headersToInject || {}).forEach(key => {
            request.headers[key] = headersToInject[key];
        });
    }

    function proxyAndRecord (responseConfig, request, logger) {
        const Q = require('q'),
            behaviors = require('./behaviors');

        if (['proxyOnce', 'proxyAlways', 'proxyTransparent'].indexOf(responseConfig.proxy.mode) < 0) {
            responseConfig.proxy.mode = 'proxyOnce';
        }

        addInjectedHeadersTo(request, responseConfig.proxy.injectHeaders);

        if (inProcessProxy) {
            return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy).then(response =>
                // Run behaviors here to persist decorated response
                Q(behaviors.execute(request, response, responseConfig._behaviors, logger))
            ).then(response => {
                recordProxyResponse(responseConfig, request, response, logger);
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

    function processResponse (responseConfig, request, logger, imposterState) {
        const Q = require('q'),
            helpers = require('../util/helpers'),
            exceptions = require('../util/errors');

        if (responseConfig.is) {
            // Clone to prevent accidental state changes downstream
            return Q(helpers.clone(responseConfig.is));
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, logger);
        }
        else if (responseConfig.inject) {
            return inject(request, responseConfig.inject, logger, imposterState).then(Q);
        }
        else {
            return Q.reject(exceptions.ValidationError('unrecognized response type',
                { source: helpers.clone(responseConfig) }));
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
     * @param {Object} imposterState - The current state for the imposter
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (responseConfig, request, logger, imposterState) {
        const Q = require('q'),
            exceptions = require('../util/errors'),
            helpers = require('../util/helpers'),
            behaviors = require('./behaviors');

        if (hasMultipleTypes(responseConfig)) {
            return Q.reject(exceptions.ValidationError('each response object must have only one response type',
                { source: responseConfig }));
        }

        return processResponse(responseConfig, helpers.clone(request), logger, imposterState).then(response => {
            // We may have already run the behaviors in the proxy call to persist the decorated response
            // in the new stub. If so, we need to ensure we don't re-run it
            if (responseConfig.proxy) {
                return Q(response);
            }
            else {
                return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
            }
        }).then(response => {
            if (inProcessProxy) {
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
     * @param {Object} logger - the logger
     * @returns {Object} - Promise resolving to the response
     */
    function resolveProxy (proxyResponse, proxyResolutionKey, logger) {
        const pendingProxyConfig = pendingProxyResolutions[proxyResolutionKey],
            behaviors = require('./behaviors'),
            Q = require('q');

        if (pendingProxyConfig) {
            return behaviors.execute(pendingProxyConfig.request, proxyResponse, pendingProxyConfig.responseConfig._behaviors, logger)
                .then(response => {
                    recordProxyResponse(pendingProxyConfig.responseConfig, pendingProxyConfig.request, response, logger);
                    response.recordMatch = () => { pendingProxyConfig.responseConfig.recordMatch(response); };
                    delete pendingProxyResolutions[proxyResolutionKey];
                    return Q(response);
                });
        }
        else {
            const errors = require('../util/errors');

            logger.error('Invalid proxy resolution key: ' + proxyResolutionKey);
            return Q.reject(errors.MissingResourceError('invalid proxy resolution key',
                { source: `${callbackUrl}/${proxyResolutionKey}` }));
        }
    }

    return { resolve, resolveProxy };
}

module.exports = { create };
