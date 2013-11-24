'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        response.send(imposter.hypermedia(response));
    }

    function del (request, response) {
        var imposter = imposters[request.params.id];

        if (imposter) {
            imposter.stop();
            delete imposters[request.params.id];
        }
        response.send();
    }

    function getRequests (request, response) {
        var imposter = imposters[request.params.id];

        response.send({ requests: imposter.requests });
    }

    function addStub (request, response) {
        var imposter = imposters[request.params.id];

        if (imposter.isValidStubRequest(request.body)) {
            imposter.addStub(request.body);
            response.statusCode = 200;
            response.send();
        }
        else {
            response.statusCode = 400;
            response.send({ errors: imposter.stubRequestErrorsFor(request.body) });
        }
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
