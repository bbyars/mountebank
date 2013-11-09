'use strict';

var Q = require('q');

function create (Protocol, port) {

    function hypermedia (response) {
        return {
            protocol: Protocol.name,
            port: port,
            links: [
                { href: response.absoluteUrl('/imposters/' + port), rel: 'self' },
                { href: response.absoluteUrl('/imposters/' + port + '/requests'), rel: 'requests' },
                { href: response.absoluteUrl('/imposters/' + port + '/stubs'), rel: 'stubs' }
            ]
        };
    }

    var deferred = Q.defer();
    Protocol.create(port).then(function () {
        deferred.resolve({
            hypermedia: hypermedia
        });
    });
    return deferred.promise;
}

module.exports = {
    create: create
};
