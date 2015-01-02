'use strict';

var Q = require('q'),
    Domain = require('domain'),
    errors = require('../util/errors');

function createErrorHandler (deferred) {
    return function errorHandler (error) {
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

function create (Protocol, request) {
    var deferred = Q.defer(),
        domain = Domain.create(),
        errorHandler = createErrorHandler(deferred);

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(request).done(function (server) {

            var url = '/imposters/' + server.port;

            if (request.stubs) {
                request.stubs.forEach(server.addStub);
            }

            function toJSON (options) {
                var result = {
                        protocol: Protocol.name,
                        port: server.port
                    };

                options = options || {};

                if (!options.list) {
                    Object.keys(server.metadata).forEach(function (key) {
                        result[key] = server.metadata[key];
                    });

                    if (!options.replayable) {
                        result.requests = server.requests;
                    }
                    result.stubs = server.stubs;
                }

                if (options.replayable) {
                    result.stubs.forEach(function (stub) {
                        if (stub.matches) {
                            delete stub.matches;
                        }
                    });
                }
                else {
                    result._links = {self: {href: url}};
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
