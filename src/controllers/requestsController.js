'use strict';

function create (imposters) {
    function get (request, response) {
        var imposter = imposters[request.params.id];
        response.send({ requests: imposter.requests });
    }

    return {
        get: get
    };
}

module.exports = {
    create: create
};
