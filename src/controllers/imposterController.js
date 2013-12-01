'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        response.send(imposter.toJSON());
    }

    function del (request, response) {
        var imposter = imposters[request.params.id],
            json = {};

        if (imposter) {
            json = imposter.toJSON();
            imposter.stop();
            delete imposters[request.params.id];
        }
        response.send(json);
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
