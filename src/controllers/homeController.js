'use strict';

function get (request, response) {
    response.format({
        json: function () {
            response.send({ _links: { imposters: { href: '/imposters' } } });
        },

        html: function () {
            response.render('index');
        }
    });
}

module.exports = {
    get: get
};
