'use strict';

var Q = require('q'),
    Domain = require('domain');

function create (Protocol, port, allowInjection, request) {
    var stubs = [];

    function url (response) {
        return response.absoluteUrl('/imposters/' + port);
    }

    function createErrorHandler (deferred) {
        return function errorHandler (error) {
            if (error.errno === 'EADDRINUSE') {
                deferred.reject({
                    code: 'port in use',
                    message: 'The port is already in use'
                });
            }
            else if (error.errno === 'EACCES') {
                deferred.reject({
                    code: 'insufficient access',
                    message: 'Run mb in superuser mode if you want to bind to that port'
                });
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

            function toJSON (response) {
                return {
                    protocol: Protocol.name,
                    port: port,
                    requests: server.requests,
                    stubs: stubs,
                    links: [
                        { href: url(response), rel: 'self' },
                        { href: url(response) + '/requests', rel: 'requests' },
                        { href: url(response) + '/stubs', rel: 'stubs' }
                    ]
                };
            }

            deferred.resolve({
                url: url,
                hypermedia: toJSON,
                requests: server.requests,
                stubsHypermedia: function () { return { stubs: stubs }; },
                addStub: addStub,
                stop: server.close,
                Validator: {
                    create: function (request) {
                        return Protocol.Validator.create(request, allowInjection);
                    }
                }
            });
        });
    });

    return deferred.promise;
}

module.exports = {
    create: create
};
