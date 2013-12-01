'use strict';

function get (request, response) {
    response.send({ _links: { imposters: { href: '/imposters' } } });
}

module.exports = {
    get: get
};
