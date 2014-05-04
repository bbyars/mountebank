'use strict';

function get (request, response) {
    var hypermedia = {
            _links: {
                imposters: { href: '/imposters' },
                config: { href: '/config' },
                logs: { href: '/logs' }
            }
        };

    response.format({
        json: function () { response.send(hypermedia); },
        html: function () { response.render('index'); }
    });
}

module.exports = {
    get: get
};
