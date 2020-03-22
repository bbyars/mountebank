'use strict';

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

/**
 * Creates the resolver
 * @param {Object} stubs - The stubs repository
 * @param {Object} proxy - The protocol-specific proxy implementation
 * @param {String} callbackURL - The protocol callback URL for response resolution
 * @returns {Object}
 */
function create (stubs, proxy, callbackURL) {
    // injectState is deprecated in favor of imposterState, but kept for backwards compatibility
    const injectState = {}, // eslint-disable-line no-unused-vars
        pendingProxyResolutions = {},
        inProcessProxy = Boolean(proxy);
    let nextProxyResolutionKey = 0;

    function inject (request, fn, logger, imposterState) {
        const Q = require('q'),
            helpers = require('../util/helpers'),
            deferred = Q.defer(),
            config = {
                request: helpers.clone(request),
                state: imposterState,
                logger: logger,
                callback: deferred.resolve
            },
            compatibility = require('./compatibility');

        compatibility.downcastInjectionConfig(config);

        // Leave parameters for older interface
        const injected = `(${fn})(config, injectState, logger, deferred.resolve, imposterState);`,
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
                logger.error(`    config.request: ${JSON.stringify(config.request)}`);
                logger.error(`    config.state: ${JSON.stringify(config.state)}`);
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
        const result = {},
            isObject = require('../util/helpers').isObject;

        Object.keys(matchers).forEach(key => {
            if (isObject(request[key])) {
                result[key] = buildEquals(request[key], matchers[key], valueOf);
            }
            else {
                result[key] = valueOf(request[key]);
            }
        });
        return result;
    }

    const path = [];

    function buildExists (request, fieldName, matchers, initialRequest) {
        const isObject = require('../util/helpers').isObject,
            setDeep = require('../util/helpers').setDeep;
        Object.keys(request).forEach(key => {
            path.push(key);
            if (isObject(request[key])) {
                buildExists(request[key], fieldName, matchers[key], initialRequest);
            }
            else {
                const booleanValue = (typeof fieldName !== 'undefined' && fieldName !== null && fieldName !== '');
                setDeep(initialRequest, path, booleanValue);
            }
        });
        return initialRequest;
    }

    function predicatesFor (request, matchers, logger) {
        const predicates = [];

        matchers.forEach(matcher => {
            if (matcher.inject) {
                // eslint-disable-next-line no-unused-vars
                const config = { request, logger },
                    injected = `(${matcher.inject})(config);`,
                    errors = require('../util/errors');
                try {
                    predicates.push(...eval(injected));
                }
                catch (error) {
                    logger.error(`injection X=> ${error}`);
                    logger.error(`    source: ${JSON.stringify(injected)}`);
                    logger.error(`    request: ${JSON.stringify(request)}`);
                    throw errors.InjectionError('invalid predicateGenerator injection', { source: injected, data: error.message });
                }
                return;
            }

            const basePredicate = {};
            let hasPredicateOperator = false;
            let predicateOperator; // eslint-disable-line no-unused-vars
            let valueOf = field => field;

            // Add parameters
            Object.keys(matcher).forEach(key => {
                if (key !== 'matches' && key !== 'predicateOperator') {
                    basePredicate[key] = matcher[key];
                }
                if (key === 'xpath') {
                    valueOf = field => xpathValue(matcher.xpath, field, logger);
                }
                else if (key === 'jsonpath') {
                    valueOf = field => jsonpathValue(matcher.jsonpath, field, logger);
                }
                else if (key === 'predicateOperator') {
                    hasPredicateOperator = true;
                    predicateOperator = matcher[key];
                }
            });

            Object.keys(matcher.matches).forEach(fieldName => {
                const helpers = require('../util/helpers'),
                    matcherValue = matcher.matches[fieldName],
                    predicate = helpers.clone(basePredicate);
                if (matcherValue === true && hasPredicateOperator === false) {
                    predicate.deepEquals = {};
                    predicate.deepEquals[fieldName] = valueOf(request[fieldName]);
                }
                else if (hasPredicateOperator === true && matcher.predicateOperator === 'exists') {
                    predicate[matcher.predicateOperator] = buildExists(request, fieldName, matcherValue, request);
                }
                else if (hasPredicateOperator === true && matcher.predicateOperator !== 'exists') {
                    predicate[matcher.predicateOperator] = valueOf(request);
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
        const stringify = require('json-stable-stringify');
        return stringify(obj1) === stringify(obj2);
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

        if (Object.keys(addBehaviors).length > 0) {
            result._behaviors = addBehaviors;
        }
        return result;
    }

    function recordProxyAlways (newPredicates, newResponse, responseConfig) {
        const filter = stubPredicates => deepEqual(newPredicates, stubPredicates);

        return responseConfig.stubIndex().then(index => {
            return stubs.first(filter, index + 1);
        }).then(match => {
            if (match.success) {
                return match.stub.addResponse(newResponse);
            }
            else {
                return stubs.add({ predicates: newPredicates, responses: [newResponse] });
            }
        });
    }

    function recordProxyResponse (responseConfig, request, response, logger) {
        const newPredicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            newResponse = newIsResponse(response, responseConfig.proxy);

        // proxyTransparent prevents the request from being recorded, and always transparently issues the request.
        if (responseConfig.proxy.mode === 'proxyTransparent') {
            return require('q')();
        }
        else if (responseConfig.proxy.mode === 'proxyOnce') {
            return responseConfig.stubIndex().then(index => {
                return stubs.insertAtIndex({ predicates: newPredicates, responses: [newResponse] }, index);
            });
        }
        else {
            return recordProxyAlways(newPredicates, newResponse, responseConfig);
        }
    }

    function proxyAndRecord (responseConfig, request, logger, requestDetails) {
        const Q = require('q'),
            startTime = new Date(),
            behaviors = require('./behaviors');

        if (['proxyOnce', 'proxyAlways', 'proxyTransparent'].indexOf(responseConfig.proxy.mode) < 0) {
            responseConfig.proxy.mode = 'proxyOnce';
        }

        if (inProcessProxy) {
            return proxy.to(responseConfig.proxy.to, request, responseConfig.proxy, requestDetails).then(response => {
                // eslint-disable-next-line no-underscore-dangle
                response._proxyResponseTime = new Date() - startTime;

                // Run behaviors here to persist decorated response
                return Q(behaviors.execute(request, response, responseConfig._behaviors, logger));
            }).then(response => {
                return recordProxyResponse(responseConfig, request, response, logger).then(() => response);
            });
        }
        else {
            pendingProxyResolutions[nextProxyResolutionKey] = {
                responseConfig: responseConfig,
                request: request,
                startTime: new Date(),
                requestDetails: requestDetails
            };
            nextProxyResolutionKey += 1;
            return Q({
                proxy: responseConfig.proxy,
                request: request,
                callbackURL: `${callbackURL}/${nextProxyResolutionKey - 1}`
            });
        }
    }

    function processResponse (responseConfig, request, logger, imposterState, requestDetails) {
        const Q = require('q'),
            helpers = require('../util/helpers'),
            exceptions = require('../util/errors');

        if (responseConfig.is) {
            // Clone to prevent accidental state changes downstream
            return Q(helpers.clone(responseConfig.is));
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, logger, requestDetails);
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
     * @param {Object} options - Additional options not carried with the request
     * @returns {Object} - Promise resolving to the response
     */
    function resolve (responseConfig, request, logger, imposterState, options) {
        const Q = require('q'),
            exceptions = require('../util/errors'),
            helpers = require('../util/helpers'),
            behaviors = require('./behaviors');

        if (hasMultipleTypes(responseConfig)) {
            return Q.reject(exceptions.ValidationError('each response object must have only one response type',
                { source: responseConfig }));
        }

        return processResponse(responseConfig, helpers.clone(request), logger, imposterState, options).then(response => {
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
     * @memberOf module:models/responseResolver#
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
            // eslint-disable-next-line no-underscore-dangle
            proxyResponse._proxyResponseTime = new Date() - pendingProxyConfig.startTime;

            return behaviors.execute(pendingProxyConfig.request, proxyResponse, pendingProxyConfig.responseConfig._behaviors, logger)
                .then(response => {
                    return recordProxyResponse(pendingProxyConfig.responseConfig, pendingProxyConfig.request, response, logger)
                        .then(() => {
                            delete pendingProxyResolutions[proxyResolutionKey];
                            return Q(response);
                        });
                });
        }
        else {
            const errors = require('../util/errors');

            logger.error('Invalid proxy resolution key: ' + proxyResolutionKey);
            return Q.reject(errors.MissingResourceError('invalid proxy resolution key',
                { source: `${callbackURL}/${proxyResolutionKey}` }));
        }
    }

    return { resolve, resolveProxy };
}

module.exports = { create };
