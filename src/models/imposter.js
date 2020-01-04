'use strict';

/**
 * An imposter represents a protocol listening on a socket.  Most imposter
 * functionality is in each particular protocol implementation.  This module
 * exists as a bridge between the API and the protocol, mapping back to pretty
 * JSON for the end user.
 * @module
 */

function createErrorHandler (deferred, port) {
    return error => {
        const errors = require('../util/errors');

        if (error.errno === 'EADDRINUSE') {
            deferred.reject(errors.ResourceConflictError(`Port ${port} is already in use`));
        }
        else if (error.errno === 'EACCES') {
            deferred.reject(errors.InsufficientAccessError());
        }
        else {
            deferred.reject(error);
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

    const Q = require('q'),
        deferred = Q.defer(),
        domain = require('domain').create(),
        errorHandler = createErrorHandler(deferred, creationRequest.port),
        compatibility = require('./compatibility'),
        logger = require('../util/scopedLogger').create(baseLogger, scopeFor(creationRequest.port)),
        helpers = require('../util/helpers'),
        imposterState = {};

    let stubs;
    let resolver;
    let encoding;
    let numberOfRequests = 0;

    compatibility.upcast(creationRequest);

    // If the CLI --mock flag is passed, we record even if the imposter level recordRequests = false
    const recordRequests = config.recordRequests || creationRequest.recordRequests;

    function findFirstMatch (request) {
        const filter = stubPredicates => {
            const predicates = require('./predicates');

            return stubPredicates.every(predicate =>
                predicates.evaluate(predicate, request, encoding, logger, imposterState));
        };

        return stubs.first(filter).then(match => {
            if (match.success) {
                logger.debug(`using predicate match: ${JSON.stringify(match.stub.predicates || {})}`);
            }
            else {
                logger.debug('no predicate match');
            }
            return match;
        });
    }

    function recordMatch (stub, request, response, responseConfig) {
        if (response.proxy) {
            // Out of process proxying. Just save the responseConfig.
            // I used to carry the function context around to getProxyResponseFor to
            // save the actual response, but it's too much complexity for too little
            // value, as I consider  saving the matches a tactical design error in retrospect
            // but give a head nod to backwards compatibility.
            return stub.recordMatch(request, responseConfig);
        }
        else if (response.response) {
            // Out of process responses wrap the result in an outer response object
            return stub.recordMatch(request, response.response);
        }
        else {
            // In process resolution
            return stub.recordMatch(request, response);
        }
    }

    // requestDetails are not stored with the imposter
    // It was created to pass the raw URL to maintain the exact querystring during http proxying
    // without having to change the path / query options on the stored request
    function getResponseFor (request, requestDetails) {
        if (!isAllowedConnection(request.ip, logger)) {
            return Q({ blocked: true, code: 'unauthorized ip address' });
        }

        numberOfRequests += 1;
        if (recordRequests) {
            stubs.addRequest(request);
        }

        return findFirstMatch(request).then(match => {
            return match.stub.nextResponse().then(responseConfig => {
                logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
                return resolver.resolve(responseConfig, request, logger, imposterState, requestDetails).then(response => {
                    if (config.recordMatches) {
                        return recordMatch(match.stub, request, response, responseConfig).then(() => response);
                    }
                    return response;
                });
            });
        });
    }

    function getProxyResponseFor (proxyResponse, proxyResolutionKey) {
        return resolver.resolveProxy(proxyResponse, proxyResolutionKey, logger);
    }

    domain.on('error', errorHandler);
    domain.run(() => {
        if (!helpers.defined(creationRequest.host) && helpers.defined(config.host)) {
            creationRequest.host = config.host;
        }

        Protocol.createServer(creationRequest, logger, getResponseFor).done(server => {
            if (creationRequest.port !== server.port) {
                logger.changeScope(scopeFor(server.port));
            }
            logger.info('Open for business...');

            stubs = server.stubs;
            resolver = server.resolver;
            encoding = server.encoding;

            if (creationRequest.stubs) {
                creationRequest.stubs.forEach(stubs.add);
            }

            function stop () {
                const stopDeferred = Q.defer();
                server.close(() => {
                    logger.info('Ciao for now');
                    return stopDeferred.resolve({});
                });
                return stopDeferred.promise;
            }

            function loadRequests () {
                return recordRequests ? stubs.loadRequests() : require('q')([]);
            }

            const printer = require('./imposterPrinter').create(creationRequest, server, loadRequests),
                toJSON = options => printer.toJSON(numberOfRequests, options);

            return deferred.resolve({
                port: server.port,
                url: '/imposters/' + server.port,
                toJSON,
                stop,
                getResponseFor,
                getProxyResponseFor,
                addStub: server.stubs.add,
                stubs: server.stubs.toJSON,
                overwriteStubs: server.stubs.overwriteAll,
                overwriteStubAtIndex: server.stubs.overwriteAtIndex,
                deleteStubAtIndex: server.stubs.deleteAtIndex,
                insertStubAtIndex: server.stubs.insertAtIndex,
                deleteSavedProxyResponses: server.stubs.deleteSavedProxyResponses
            });
        });
    });

    return deferred.promise;
}

module.exports = { create };
