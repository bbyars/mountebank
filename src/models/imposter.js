'use strict';

/**
 * An imposter represents a protocol listening on a socket.  Most imposter
 * functionality is in each particular protocol implementation.  This module
 * exists as a bridge between the API and the protocol, mapping back to pretty
 * JSON for the end user.
 * @module
 */


const prometheus = require('prom-client'),
    metrics = {
        predicateMatchDuration: new prometheus.Histogram({
            name: 'mb_predicate_match_duration_seconds',
            help: 'Time it takes to match the predicates and select a stub',
            buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1],
            labelNames: ['imposter']
        }),
        noMatchCount: new prometheus.Counter({
            name: 'mb_no_match_total',
            help: 'Number of times no stub matched the request',
            labelNames: ['imposter']
        }),
        requestCount: new prometheus.Counter({
            name: 'mb_request_total',
            help: 'Number of requests to the imposter',
            labelNames: ['imposter']
        }),
        responseGenerationDuration: new prometheus.Histogram({
            name: 'mb_response_generation_duration_seconds',
            help: 'Time it takes to generate the response from a stub',
            buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 3, 5, 10, 30],
            labelNames: ['imposter']
        }),
        blockedIPCount: new prometheus.Counter({
            name: 'mb_blocked_ip_total',
            help: 'Number of times a connection was blocked from a non-whitelisted IP address',
            labelNames: ['imposter']
        })
    };

function createErrorHandler (reject, port) {
    return error => {
        const errors = require('../util/errors');

        if (error.errno === 'EADDRINUSE') {
            reject(errors.ResourceConflictError(`Port ${port} is already in use`));
        }
        else if (error.errno === 'EACCES') {
            reject(errors.InsufficientAccessError());
        }
        else {
            reject(error);
        }
    };
}

/**
 * Create the imposter
 * @param {Object} Protocol - The protocol factory for creating servers of that protocol
 * @param {Object} creationRequest - the parsed imposter JSON
 * @param {Object} baseLogger - the logger
 * @param {Object} config - command line options
 * @param {Function} isAllowedConnection - function to determine if the IP address of the requestor is allowed
 * @returns {Object}
 */
function create (Protocol, creationRequest, baseLogger, config, isAllowedConnection) {
    function scopeFor (port) {
        let scope = `${creationRequest.protocol}:${port}`;

        if (creationRequest.name) {
            scope += ' ' + creationRequest.name;
        }
        return scope;
    }

    return new Promise((resolve, reject) => {
        const domain = require('domain').create(),
            errorHandler = createErrorHandler(reject, creationRequest.port),
            compatibility = require('./compatibility'),
            logger = require('../util/scopedLogger').create(baseLogger, scopeFor(creationRequest.port)),
            helpers = require('../util/helpers'),
            imposterState = {},
            unresolvedProxies = {},
            header = helpers.clone(creationRequest);

        // Free up the memory by allowing garbage collection of stubs when using filesystemBackedImpostersRepository
        delete header.stubs;

        let stubs;
        let resolver;
        let encoding;
        let numberOfRequests = 0;

        compatibility.upcast(creationRequest);

        // If the CLI --mock flag is passed, we record even if the imposter level recordRequests = false
        const recordRequests = config.recordRequests || creationRequest.recordRequests;

        async function findFirstMatch (request) {
            const filter = stubPredicates => {
                    const predicates = require('./predicates');

                    return stubPredicates.every(predicate =>
                        predicates.evaluate(predicate, request, encoding, logger, imposterState));
                },
                observePredicateMatchDuration = metrics.predicateMatchDuration.startTimer(),
                match = await stubs.first(filter);

            observePredicateMatchDuration({ imposter: logger.scopePrefix });
            if (match.success) {
                logger.debug(`using predicate match: ${JSON.stringify(match.stub.predicates || {})}`);
            }
            else {
                metrics.noMatchCount.inc({ imposter: logger.scopePrefix });
                logger.info('no predicate match, using default response');
            }
            return match;
        }

        function recordMatch (stub, request, response, responseConfig, start) {
            if (response.proxy) {
                // Out of process proxying, so we don't have the actual response yet.
                const parts = response.callbackURL.split('/'),
                    proxyResolutionKey = parts[parts.length - 1];

                unresolvedProxies[proxyResolutionKey] = {
                    recordMatch: proxyResponse => {
                        return stub.recordMatch(request, proxyResponse, responseConfig, new Date() - start);
                    }
                };
                return Promise.resolve();
            }
            else if (response.response) {
                // Out of process responses wrap the result in an outer response object
                return stub.recordMatch(request, response.response, responseConfig, new Date() - start);
            }
            else {
                // In process resolution
                return stub.recordMatch(request, response, responseConfig, new Date() - start);
            }
        }

        // requestDetails are not stored with the imposter
        // It was created to pass the raw URL to maintain the exact querystring during http proxying
        // without having to change the path / query options on the stored request
        async function getResponseFor (request, requestDetails) {
            if (!isAllowedConnection(request.ip, logger)) {
                metrics.blockedIPCount.inc({ imposter: logger.scopePrefix });
                return Promise.resolve({ blocked: true, code: 'unauthorized ip address' });
            }

            const start = new Date();

            metrics.requestCount.inc({ imposter: logger.scopePrefix });
            numberOfRequests += 1;
            if (recordRequests) {
                stubs.addRequest(request);
            }

            const match = await findFirstMatch(request),
                observeResponseGenerationDuration = metrics.responseGenerationDuration.startTimer(),
                responseConfig = await match.stub.nextResponse();

            logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
            const response = await resolver.resolve(responseConfig, request, logger, imposterState, requestDetails);
            if (config.recordMatches) {
                await recordMatch(match.stub, request, response, responseConfig, start);
            }
            observeResponseGenerationDuration({ imposter: logger.scopePrefix });
            return response;
        }

        async function getProxyResponseFor (proxyResponse, proxyResolutionKey) {
            const response = await resolver.resolveProxy(proxyResponse, proxyResolutionKey, logger, imposterState);
            if (config.recordMatches && unresolvedProxies[String(proxyResolutionKey)].recordMatch) {
                await unresolvedProxies[String(proxyResolutionKey)].recordMatch(response);
            }
            delete unresolvedProxies[String(proxyResolutionKey)];
            return response;
        }

        async function resetRequests () {
            await stubs.deleteSavedRequests();
            numberOfRequests = 0;
            return true;
        }

        domain.on('error', errorHandler);
        domain.run(async function () {
            if (!helpers.defined(creationRequest.host) && helpers.defined(config.host)) {
                creationRequest.host = config.host;
            }

            const server = await Protocol.createServer(creationRequest, logger, getResponseFor);
            if (creationRequest.port !== server.port) {
                creationRequest.port = server.port;
                logger.changeScope(scopeFor(server.port));
            }
            logger.info('Open for business...');

            stubs = server.stubs;
            resolver = server.resolver;
            encoding = server.encoding;

            function stop () {
                return new Promise(stopResolve => {
                    server.close(() => {
                        logger.info('Ciao for now');
                        return stopResolve({});
                    });
                });
            }

            function loadRequests () {
                return recordRequests ? stubs.loadRequests() : Promise.resolve([]);
            }

            const printer = require('./imposterPrinter').create(header, server, loadRequests),
                toJSON = options => printer.toJSON(numberOfRequests, options);

            return resolve({
                port: server.port,
                url: '/imposters/' + server.port,
                creationRequest: creationRequest,
                toJSON,
                stop,
                getResponseFor,
                getProxyResponseFor,
                resetRequests
            });
        });
    });
}

module.exports = { create };
