'use strict';

var Q = require('q'),
    Domain = require('domain'),
    errors = require('../errors/errors');

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

function create (Protocol, port, request) {
    var stubs = [],
        url = '/imposters/' + port,
        deferred = Q.defer(),
        domain = Domain.create(),
        errorHandler = createErrorHandler(deferred);

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(port, request).done(function (server) {

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
                    port: port,
                    _links: { self: { href: url } }
                };
            }

            function toJSON () {
                var result = toListJSON();
                result.requests = server.requests;
                result.stubs = stubs;

                Object.keys(server.metadata).forEach(function (key) {
                    result[key] = server.metadata[key];
                });
                return result;
            }

            deferred.resolve({
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
