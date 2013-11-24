'use strict';

var Q = require('q'),
    Domain = require('domain');

function create (Protocol, port) {

    function url (response) {
        return response.absoluteUrl('/imposters/' + port);
    }

    function hypermedia (response) {
        return {
            protocol: Protocol.name,
            port: port,
            links: [
                { href: url(response), rel: 'self' },
                { href: url(response) + '/requests', rel: 'requests' },
                { href: url(response) + '/stubs', rel: 'stubs' }
            ]
        };
    }

    var deferred = Q.defer(),
        domain = Domain.create(),
        errorHandler = function (error) {
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
                throw error;
            }
        };

    domain.on('error', errorHandler);
    domain.run(function () {
        Protocol.create(port).done(function (server) {
            deferred.resolve({
                url: url,
                hypermedia: hypermedia,
                requests: server.requests,
                isValidStubRequest: server.isValidStubRequest,
                stubRequestErrorsFor: server.stubRequestErrorsFor,
                addStub: server.addStub,
                stop: function () { server.close(); }
            });
        });
    });

    return deferred.promise;
}

module.exports = {
    create: create
};
