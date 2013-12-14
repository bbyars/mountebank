'use strict';

var Q = require('q'),
    Domain = require('domain'),
    errors = require('../errors/errors');

function create (Protocol, port, request) {
    var stubs = [],
        url = '/imposters/' + port;

    function createErrorHandler (deferred) {
        return function errorHandler (error) {
            if (error.errno === 'EADDRINUSE') {
                deferred.reject(errors.ResourceConflictError('The port is already in use'));
            }
            else if (error.errno === 'EACCES') {
                deferred.reject(errors.InsufficientAccessError('Run mb in superuser mode if you want to bind to that port'));
            }
            else {
                deferred.reject(error);
            }
        };
    }

    var deferred = Q.defer(),
        domain = Domain.create(),
        errorHandler = createErrorHandler(deferred);

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(port).done(function (server) {

            function addStub (stub) {
                server.addStub(stub);
                stubs.push(stub);
            }

            if (request && request.stubs) {
                request.stubs.forEach(function (stub) {
                    addStub(stub);
                });
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
