'use strict';

/**
 * An imposter represents a protocol listening on a socket.  Most imposter
 * functionality is in each particular protocol implementation.  This module
 * exists as a bridge between the API and the protocol, mapping back to pretty
 * JSON for the end user.
 * @module
 */

const createErrorHandler = (deferred, port) => error => {
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

/**
 * Create the imposter
 * @param {Object} Protocol - The protocol factory for creating servers of that protocol
 * @param {Object} request - the parsed imposter JSON
 * @returns {Object}
 */
const create = (Protocol, request) => {
    const Q = require('q'),
        deferred = Q.defer(),
        domain = require('domain').create(),
        errorHandler = createErrorHandler(deferred, request.port),
        compatibility = require('./compatibility');

    compatibility.upcast(request);

    domain.on('error', errorHandler);
    domain.run(() => {
        Protocol.create(request).done(server => {

            const url = `/imposters/${server.port}`;

            if (request.stubs) {
                request.stubs.forEach(server.addStub);
            }

            const addDetailsTo = result => {
                Object.keys(server.metadata).forEach(key => {
                    result[key] = server.metadata[key];
                });

                result.requests = server.requests;
                result.stubs = server.stubs();
            };

            const removeNonEssentialInformationFrom = result => {
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
            };

            const removeProxiesFrom = result => {
                result.stubs.forEach(stub => {
                    stub.responses = stub.responses.filter(response => !response.hasOwnProperty('proxy'));
                });
                result.stubs = result.stubs.filter(stub => stub.responses.length > 0);
            };

            const toJSON = options => {
                // I consider the order of fields represented important.  They won't matter for parsing,
                // but it makes a nicer user experience for developers viewing the JSON to keep the most
                // relevant information at the top
                const result = {
                    protocol: Protocol.name,
                    port: server.port,
                    numberOfRequests: server.numberOfRequests()
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
            };

            const resetProxies = () => server.resetProxies();

            deferred.resolve({
                port: server.port,
                url,
                toJSON,
                addStub: server.addStub,
                stop: server.close,
                resetProxies
            });
        });
    });

    return deferred.promise;
};

module.exports = { create };
