'use strict';

const prometheus = require('prom-client'),
    stringify = require('safe-stable-stringify'),
    helpers = require('../util/helpers.js'),
    compatibility = require('./compatibility.js'),
    exceptions = require('../util/errors.js'),
    xpath = require('./xpath.js'),
    jsonpath = require('./jsonpath.js'),
    behaviors = require('./behaviors.js');

/**
 * Determines the response for a stub based on the user-provided response configuration
 * @module
 */

const metrics = {
    proxyDuration: new prometheus.Histogram({
        name: 'mb_proxy_duration_seconds',
        help: 'Time it takes to get the response from the downstream service',
        buckets: [0.1, 0.2, 0.5, 1, 3, 5, 10, 30],
        labelNames: ['imposter']
    }),
    proxyCount: new prometheus.Counter({
        name: 'mb_proxy_total',
        help: 'Number of times a request was proxied to a downstream service',
        labelNames: ['imposter']
    })
};

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
        if (request.isDryRun) {
            return Promise.resolve({});
        }

        return new Promise((done, reject) => {
            // Leave parameters for older interface
            const injected = `(${fn})(config, injectState, logger, done, imposterState);`,
                config = {
                    request: helpers.clone(request),
                    state: imposterState,
                    logger: logger,
                    callback: done
                };

            compatibility.downcastInjectionConfig(config);

            try {
                const response = eval(injected);
                if (helpers.defined(response)) {
                    done(response);
                }
            }
            catch (error) {
                logger.error(`injection X=> ${error}`);
                logger.error(`    full source: ${JSON.stringify(injected)}`);
                logger.error(`    config.request: ${JSON.stringify(config.request)}`);
                logger.error(`    config.state: ${JSON.stringify(config.state)}`);
                reject(exceptions.InjectionError('invalid response injection', {
                    source: injected,
                    data: error.message
                }));
            }
        });
    }

    function selectionValue (nodes) {
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
        const nodes = xpath.select(xpathConfig.selector, xpathConfig.ns, possibleXML, logger);

        return selectionValue(nodes);
    }

    function jsonpathValue (jsonpathConfig, possibleJSON, logger) {
        const nodes = jsonpath.select(jsonpathConfig.selector, possibleJSON, logger);

        return selectionValue(nodes);
    }

    function buildDeepEqual (request, fieldName, predicateGenerators, valueOf) {
        if (!predicateGenerators.ignore) {
            return valueOf(request[fieldName]);
        }
        const objFilter = helpers.objFilter;
        return valueOf(objFilter(request[fieldName], predicateGenerators.ignore[fieldName]));
    }

    function buildEquals (request, matchers, valueOf) {
        const result = {},
            isObject = helpers.isObject;

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
        const isObject = helpers.isObject,
            setDeep = helpers.setDeep;
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
                    injected = `(${matcher.inject})(config);`;

                try {
                    predicates.push(...eval(injected));
                }
                catch (error) {
                    logger.error(`injection X=> ${error}`);
                    logger.error(`    source: ${JSON.stringify(injected)}`);
                    logger.error(`    request: ${JSON.stringify(request)}`);
                    throw exceptions.InjectionError('invalid predicateGenerator injection', { source: injected, data: error.message });
                }
                return;
            }

            const basePredicate = {};
            let hasPredicateOperator = false;
            let predicateOperator; // eslint-disable-line no-unused-vars
            let valueOf = field => field;

            // Add parameters
            Object.keys(matcher).forEach(key => {
                if (key !== 'matches' && key !== 'predicateOperator' && key !== 'ignore') {
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
                }
            });

            Object.keys(matcher.matches).forEach(fieldName => {
                const matcherValue = matcher.matches[fieldName],
                    predicate = helpers.clone(basePredicate);

                if (matcherValue === true && hasPredicateOperator === false) {
                    predicate.deepEquals = {};
                    predicate.deepEquals[fieldName] = buildDeepEqual(request, fieldName, matcher, valueOf);
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
        return stringify(obj1) === stringify(obj2);
    }

    function newIsResponse (response, proxyConfig) {
        const result = { is: response },
            addBehaviors = [];

        if (proxyConfig.addWaitBehavior && response._proxyResponseTime) {
            addBehaviors.push({ wait: response._proxyResponseTime });
        }
        if (proxyConfig.addDecorateBehavior) {
            addBehaviors.push({ decorate: proxyConfig.addDecorateBehavior });
        }

        if (addBehaviors.length > 0) {
            result.behaviors = addBehaviors;
        }
        return result;
    }

    async function recordProxyAlways (newPredicates, newResponse, responseConfig) {
        const filter = stubPredicates => deepEqual(newPredicates, stubPredicates),
            index = await responseConfig.stubIndex(),
            match = await stubs.first(filter, index + 1);

        if (match.success) {
            return match.stub.addResponse(newResponse);
        }
        else {
            return stubs.add({ predicates: newPredicates, responses: [newResponse] });
        }
    }

    async function recordProxyResponse (responseConfig, request, response, logger) {
        const newPredicates = predicatesFor(request, responseConfig.proxy.predicateGenerators || [], logger),
            newResponse = newIsResponse(response, responseConfig.proxy);

        if (responseConfig.proxy.mode === 'proxyOnce') {
            const index = await responseConfig.stubIndex();
            await stubs.insertAtIndex({ predicates: newPredicates, responses: [newResponse] }, index);
        }
        else if (responseConfig.proxy.mode === 'proxyAlways') {
            await recordProxyAlways(newPredicates, newResponse, responseConfig);
        }
    }

    async function proxyAndRecord (responseConfig, request, logger, requestDetails, imposterState) {
        const startTime = new Date(),
            observeProxyDuration = metrics.proxyDuration.startTimer();

        metrics.proxyCount.inc({ imposter: logger.scopePrefix });

        if (['proxyOnce', 'proxyAlways', 'proxyTransparent'].indexOf(responseConfig.proxy.mode) < 0) {
            responseConfig.proxy.mode = 'proxyOnce';
        }

        if (inProcessProxy) {
            const response = await proxy.to(responseConfig.proxy.to, request, responseConfig.proxy, requestDetails);
            observeProxyDuration({ imposter: logger.scopePrefix });
            response._proxyResponseTime = new Date() - startTime;

            // Run behaviors here to persist decorated response
            const transformed = await behaviors.execute(request, response, responseConfig.behaviors, logger, imposterState);
            await recordProxyResponse(responseConfig, request, transformed, logger);
            return transformed;
        }
        else {
            pendingProxyResolutions[nextProxyResolutionKey] = {
                responseConfig: responseConfig,
                request: request,
                requestDetails: requestDetails,
                observeProxyDuration: observeProxyDuration,
                startTime: startTime
            };
            nextProxyResolutionKey += 1;
            return {
                proxy: responseConfig.proxy,
                request: request,
                callbackURL: `${callbackURL}/${nextProxyResolutionKey - 1}`
            };
        }
    }

    function processResponse (responseConfig, request, logger, imposterState, requestDetails) {
        if (responseConfig.is) {
            // Clone to prevent accidental state changes downstream
            return Promise.resolve(helpers.clone(responseConfig.is));
        }
        else if (responseConfig.proxy) {
            return proxyAndRecord(responseConfig, request, logger, requestDetails, imposterState);
        }
        else if (responseConfig.inject) {
            return inject(request, responseConfig.inject, logger, imposterState);
        }
        else if (responseConfig.fault) {
            // Clone to prevent accidental state changes downstream
            return Promise.resolve(helpers.clone(responseConfig));
        }
        else {
            return Promise.reject(exceptions.ValidationError('unrecognized response type',
                { source: helpers.clone(responseConfig) }));
        }
    }

    // eslint-disable-next-line complexity
    function hasMultipleTypes (responseConfig) {
        return (responseConfig.is && responseConfig.proxy) ||
               (responseConfig.is && responseConfig.inject) ||
               (responseConfig.proxy && responseConfig.inject) ||
               (responseConfig.fault && responseConfig.proxy) ||
               (responseConfig.fault && responseConfig.is) ||
               (responseConfig.fault && responseConfig.inject);
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
    async function resolve (responseConfig, request, logger, imposterState, options) {
        if (hasMultipleTypes(responseConfig)) {
            return Promise.reject(exceptions.ValidationError('each response object must have only one response type',
                { source: responseConfig }));
        }

        let response = await processResponse(responseConfig, helpers.clone(request), logger, imposterState, options);

        // We may have already run the behaviors in the proxy call to persist the decorated response
        // in the new stub. If so, we need to ensure we don't re-run it
        // If we're doing fault simulation there's no need to execute the behaviours
        if (!responseConfig.proxy && !responseConfig.fault) {
            response = await behaviors.execute(request, response, responseConfig.behaviors, logger, imposterState);
        }

        if (inProcessProxy) {
            return response;
        }
        else {
            return responseConfig.proxy ? response : { response };
        }
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
     * @param {Object} imposterState - the user controlled state variable
     * @returns {Object} - Promise resolving to the response
     */
    async function resolveProxy (proxyResponse, proxyResolutionKey, logger, imposterState) {
        const pendingProxyConfig = pendingProxyResolutions[proxyResolutionKey];

        if (pendingProxyConfig) {
            pendingProxyConfig.observeProxyDuration({ imposter: logger.scopePrefix });
            proxyResponse._proxyResponseTime = new Date() - pendingProxyConfig.startTime;

            const response = await behaviors.execute(pendingProxyConfig.request, proxyResponse,
                pendingProxyConfig.responseConfig.behaviors, logger, imposterState);
            await recordProxyResponse(pendingProxyConfig.responseConfig, pendingProxyConfig.request, response, logger);
            delete pendingProxyResolutions[proxyResolutionKey];
            return response;
        }
        else {
            logger.error('Invalid proxy resolution key: ' + proxyResolutionKey);
            return Promise.reject(exceptions.MissingResourceError('invalid proxy resolution key',
                { source: `${callbackURL}/${proxyResolutionKey}` }));
        }
    }

    return { resolve, resolveProxy };
}

module.exports = { create };
