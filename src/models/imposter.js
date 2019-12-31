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
        requests = [],
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
        const readOnlyState = helpers.clone(imposterState),
            filter = stubPredicates => {
                const predicates = require('./predicates');

                return stubPredicates.every(predicate =>
                    predicates.evaluate(predicate, request, encoding, logger, readOnlyState));
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

    // requestDetails are not stored with the imposter
    // It was created to pass the raw URL to maintain the exact querystring during http proxying
    // without having to change the path / query options on the stored request
    function getResponseFor (request, requestDetails) {
        if (!isAllowedConnection(request.ip, logger)) {
            return Q({ blocked: true, code: 'unauthorized ip address' });
        }

        numberOfRequests += 1;
        if (recordRequests) {
            const recordedRequest = helpers.clone(request);
            recordedRequest.timestamp = new Date().toJSON();
            requests.push(recordedRequest);
        }

        return findFirstMatch(request).then(match => {
            return match.stub.nextResponse().then(responseConfig => {
                logger.debug(`generating response from ${JSON.stringify(responseConfig)}`);
                responseConfig.stubIndex = () => match.index;
                return resolver.resolve(responseConfig, request, logger, imposterState, requestDetails).then(response => {
                    if (config.recordMatches && !response.proxy) {
                        if (response.response) {
                            // Out of process responses wrap the result in an outer response object
                            responseConfig.recordMatch(request, response.response);
                        }
                        else {
                            // In process resolution
                            responseConfig.recordMatch(request, response);
                        }
                    }
                    return response;
                });
            });
        });
    }

    function getProxyResponseFor (proxyResponse, proxyResolutionKey) {
        return resolver.resolveProxy(proxyResponse, proxyResolutionKey, logger).then(response => {
            if (config.recordMatches) {
                response.recordMatch();
            }
            return Q(response);
        });
    }

    function isRecordedResponse (response) {
        return response.is && response.is._proxyResponseTime; // eslint-disable-line no-underscore-dangle
    }

    /**
     * Removes the saved proxy responses
     * @returns {Object} - Promise
     */
    function resetProxies () {
        return stubs.all()
            .then(allStubs => Q.all(allStubs.map(stub => stub.deleteResponsesMatching(isRecordedResponse))))
            .then(() => stubs.all())
            .then(allStubs => {
                let sequence = Q();
                const stubIndexesToDelete = [];

                for (let i = allStubs.length - 1; i >= 0; i -= 1) {
                    if (allStubs[i].responses.length === 0) {
                        stubIndexesToDelete.push(i);
                    }
                }

                stubIndexesToDelete.forEach(index => {
                    sequence = sequence.then(stubs.deleteAtIndex(index));
                });
                return sequence;
            });
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

            const printer = require('./imposterPrinter').create(creationRequest, server, requests),
                toJSON = options => printer.toJSON(numberOfRequests, options);

            return deferred.resolve({
                port: server.port,
                url: '/imposters/' + server.port,
                toJSON,
                stop,
                resetProxies,
                getResponseFor,
                getProxyResponseFor,
                addStub: server.stubs.add,
                stubs: server.stubs.all,
                overwriteStubs: server.stubs.overwriteAll,
                overwriteStubAtIndex: server.stubs.overwriteAtIndex,
                deleteStubAtIndex: server.stubs.deleteAtIndex,
                insertStubAtIndex: server.stubs.insertAtIndex
            });
        });
    });

    return deferred.promise;
}

module.exports = { create };
