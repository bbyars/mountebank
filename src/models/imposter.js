'use strict';

/**
 * An imposter represents a protocol listening on a socket.  Most imposter
 * functionality is in each particular protocol implementation.  This module
 * exists as a bridge between the API and the protocol, mapping back to pretty
 * JSON for the end user.
 * @module
 */

function createErrorHandler (deferred) {
    return function errorHandler (error) {
        var errors = require('../util/errors');

        if (error.errno === 'EADDRINUSE') {
            deferred.reject(errors.ResourceConflictError('The port is already in use'));
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
 * @param {Object} request - the parsed imposter JSON
 * @returns {Object}
 */
function create (Protocol, request) {
    var Q = require('q'),
        deferred = Q.defer(),
        domain = require('domain').create(),
        errorHandler = createErrorHandler(deferred);

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(request).done(function (server) {

            var url = '/imposters/' + server.port;

            if (request.stubs) {
                request.stubs.forEach(server.addStub);
            }

            function addDetailsTo (result) {
                Object.keys(server.metadata).forEach(function (key) {
                    result[key] = server.metadata[key];
                });

                result.requests = server.requests;
                result.stubs = server.stubs();
            }

            function removeNonEssentialInformationFrom (result) {
                result.stubs.forEach(function (stub) {
                    if (stub.matches) {
                        delete stub.matches;
                    }
                });
                delete result.numberOfRequests;
                delete result.requests;
                delete result._links;
            }

            function removeProxiesFrom (result) {
                result.stubs.forEach(function (stub) {
                    stub.responses = stub.responses.filter(function (response) {
                        return !response.hasOwnProperty('proxy');
                    });
                });
                result.stubs = result.stubs.filter(function (stub) {
                    return stub.responses.length > 0;
                });
            }

            function toJSON (options) {
                // I consider the order of fields represented important.  They won't matter for parsing,
                // but it makes a nicer user experience for developers viewing the JSON to keep the most
                // relevant information at the top
                var result = {
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
            }

            deferred.resolve({
                port: server.port,
                url: url,
                toJSON: toJSON,
                addStub: server.addStub,
                stop: server.close
            });
        });
    });

    return deferred.promise;
}

module.exports = {
    create: create
};
