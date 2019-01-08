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
 * @param {Object} recordMatches - corresponds to the --debug command line flag
 * @param {Object} recordRequests - corresponds to the --mock command line flag
 * @param {Object} mountebankPort - the mountebank port for callback URLs from the imposter
 * @returns {Object}
 */
// TODO: Clean up constructor interface...
// eslint-disable-next-line max-params
function create (Protocol, creationRequest, baseLogger, recordMatches, recordRequests, mountebankPort) {
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
        logger = require('../util/scopedLogger').create(baseLogger, scopeFor(creationRequest.port));

    let proxy, resolver, stubs;
    let numberOfRequests = 0;

    compatibility.upcast(creationRequest);

    // Can set per imposter
    if (typeof creationRequest.recordRequests !== 'undefined') {
        recordRequests = creationRequest.recordRequests;
    }

    function getResponseFor (request) {
        const helpers = require('../util/helpers');

        numberOfRequests += 1;
        if (recordRequests) {
            const recordedRequest = helpers.clone(request);
            recordedRequest.timestamp = new Date().toJSON();
            requests.push(recordedRequest);
        }

        return stubs.resolve(request, logger);
    }

    function getProxyResponseFor (proxyResponse, proxyResolutionKey) {
        return stubs.resolveProxy(proxyResponse, proxyResolutionKey, logger);
    }

    domain.on('error', errorHandler);
    domain.run(() => {
        Protocol.create(creationRequest, logger, getResponseFor).done(server => {
            if (creationRequest.port !== server.port) {
                logger.changeScope(scopeFor(server.port));
            }
            logger.info('Open for business...');

            // TODO: Get host from mountebank.js?
            const url = `/imposters/${server.port}`,
                callbackUrl = `http://localhost:${mountebankPort}${url}/_requests`;

            // TODO: Remove once all proto implementations converted
            if (server.setCallbackUrl) {
                server.setCallbackUrl(callbackUrl);
            }

            if (creationRequest.protocol !== 'foo') {
                proxy = server.proxy;
            }
            resolver = require('./responseResolver').create(proxy, callbackUrl);
            stubs = require('./stubRepository').create(resolver, recordMatches, server.encoding || 'utf8');

            if (creationRequest.stubs) {
                creationRequest.stubs.forEach(stubs.addStub);
            }

            function addDetailsTo (result) {
                if (creationRequest.name) {
                    result.name = creationRequest.name;
                }
                result.recordRequests = recordRequests;

                Object.keys(server.metadata).forEach(key => {
                    result[key] = server.metadata[key];
                });

                result.requests = requests;
                result.stubs = stubs.stubs();
            }

            function removeNonEssentialInformationFrom (result) {
                const helpers = require('../util/helpers');

                result.stubs.forEach(stub => {
                    /* eslint-disable no-underscore-dangle */
                    if (stub.matches) {
                        delete stub.matches;
                    }
                    stub.responses.forEach(response => {
                        if (helpers.defined(response.is) && helpers.defined(response.is._proxyResponseTime)) {
                            delete response.is._proxyResponseTime;
                        }
                    });
                });
                delete result.numberOfRequests;
                delete result.requests;
                delete result._links;
            }

            function removeProxiesFrom (result) {
                result.stubs.forEach(stub => {
                    stub.responses = stub.responses.filter(response => !response.hasOwnProperty('proxy'));
                });
                result.stubs = result.stubs.filter(stub => stub.responses.length > 0);
            }

            function toJSON (options) {
                // I consider the order of fields represented important.  They won't matter for parsing,
                // but it makes a nicer user experience for developers viewing the JSON to keep the most
                // relevant information at the top
                const result = {
                    protocol: creationRequest.protocol,
                    port: server.port,
                    numberOfRequests: numberOfRequests
                };

                options = options || {};

                if (!options.list) {
                    addDetailsTo(result);
                }

                result._links = { self: { href: url } };

                if (options.replayable) {
                    removeNonEssentialInformationFrom(result);
                }
                if (options.removeProxies) {
                    removeProxiesFrom(result);
                }

                return result;
            }

            function stop () {
                const stopDeferred = Q.defer();
                server.close(() => {
                    logger.info('Ciao for now');
                    return stopDeferred.resolve({});
                });
                return stopDeferred.promise;
            }

            return deferred.resolve({
                port: server.port,
                url,
                toJSON,
                addStub: stubs.addStub,
                stop,
                resetProxies: stubs.resetProxies,
                getResponseFor,
                getProxyResponseFor
            });
        });
    });

    return deferred.promise;
}

module.exports = { create };
