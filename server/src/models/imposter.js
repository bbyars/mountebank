'use strict';

function create (protocol, port) {

    function hypermedia (response) {
        return {
            protocol: protocol,
            port: parseInt(port, 10),
            links: [
                { href: response.absoluteUrl('/imposters/' + port), rel: 'self' },
                { href: response.absoluteUrl('/imposters/' + port + '/requests'), rel: 'requests' },
                { href: response.absoluteUrl('/imposters/' + port + '/stubs'), rel: 'stubs' }
            ]
        };
    }

    return {
        hypermedia: hypermedia
    };
}

module.exports = {
    create: create
};
