'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        response.send(imposter.hypermedia(response));
    }

    function del (request, response) {
        var imposter = imposters[request.params.id];

        imposter.stop();
        delete imposters[request.params.id];
        response.send();
    }

    function getRequests (request, response) {
        var imposter = imposters[request.params.id];

        response.send({ requests: imposter.requests });
    }

    function addStub (/*request, response*/) {

    }

    return {
        get: get,
        del: del,
        getRequests: getRequests,
        addStub: addStub
    };
}

module.exports = {
    create: create
};
