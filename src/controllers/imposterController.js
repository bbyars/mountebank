'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        response.send(imposter.toJSON());
    }

    function del (request, response) {
        var imposter = imposters[request.params.id];

        if (imposter) {
            imposter.stop();
            delete imposters[request.params.id];
        }
        response.send();
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
