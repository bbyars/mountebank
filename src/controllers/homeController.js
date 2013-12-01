'use strict';

function get (request, response) {
    response.send({ links: [{ href: '/imposters', rel: 'imposters' }] });
}

module.exports = {
    get: get
};
