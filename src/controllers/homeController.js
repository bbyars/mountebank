'use strict';

function get (request, response) {
    var hypermedia = {
        links: [
            {
                href: response.absoluteUrl('/imposters'),
                rel: 'imposters'
            }
        ]
    };
    response.send(hypermedia);
}

module.exports = {
    get: get
};
