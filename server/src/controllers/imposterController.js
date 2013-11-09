'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        if (imposter) {
            response.send(imposter.hypermedia(response));
        }
        else {
            response.statusCode = 404;
            response.send();
        }
    }

    function del (request, response) {
        var imposter = imposters[request.params.id];

        if (imposter) {
            imposter.stop();
            delete imposters[request.params.id];
            response.send();
        }
        else {
            response.statusCode = 404;
            response.send();
        }
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
