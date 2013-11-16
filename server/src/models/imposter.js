'use strict';

var Q = require('q');

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

    var deferred = Q.defer();

    process.on('uncaughtException', function (error) {
        if (error.errno === 'EADDRINUSE') {
            deferred.reject({
                code: 'port in use',
                message: 'The port is already in use'
            });
        }
        else if (error.errno === 'EACCES') {
            deferred.reject({
                code: 'invalid access',
                message: 'Run mb in superuser mode if you want to bind to that port'
            });
        }
        else {
            throw error;
        }
    });

    Protocol.create(port).then(function (server) {
        deferred.resolve({
            url: url,
            hypermedia: hypermedia,
            requests: server.requests,
            stop: function () { server.close(); }
        });
    });

    return deferred.promise;
}

module.exports = {
    create: create
};
