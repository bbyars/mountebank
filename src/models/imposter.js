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
    var stubs = [],
        deferred = Q.defer(),
        domain = Domain.create(),
        errorHandler = createErrorHandler(deferred);

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(request).done(function (server) {

            var url = '/imposters/' + server.port;

            function addStub (stub) {
                server.addStub(stub);
                stubs.push(stub);
            }

            if (request && request.stubs) {
                request.stubs.forEach(addStub);
            }

            function toListJSON () {
                return {
                    protocol: Protocol.name,
                    port: server.port,
                    _links: { self: { href: url } }
                };
            }

            function toJSON () {
                var result = {
                    protocol: Protocol.name,
                    port: server.port
                };
                Object.keys(server.metadata).forEach(function (key) {
                    result[key] = server.metadata[key];
                });
                result.requests = server.requests;
                result.stubs = stubs;
                result._links = { self: { href: url } };

                return result;
            }

            deferred.resolve({
                port: server.port,
                url: url,
                toJSON: toJSON,
                toListJSON: toListJSON,
                addStub: addStub,
                stop: server.close
            });
        });
    });

    return deferred.promise;
}

module.exports = {
    create: create
};
