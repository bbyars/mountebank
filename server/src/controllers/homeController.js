'use strict'

function get (request, response) {
    var hypermedia = {
        links: [
            {
                href: response.absoluteUrl('/servers'),
                rel: 'servers'
            }
        ]
    };
    response.send(hypermedia);
}

module.exports = {
    get: get
};
