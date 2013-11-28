'use strict';

function create (imposters) {

    function get (request, response) {
        var imposter = imposters[request.params.id];

        response.statusCode = 200;
        response.send(imposter.stubsHypermedia(response));
    }

    function post (request, response) {
        var imposter = imposters[request.params.id],
            validator = imposter.Validator.create({stubs: [request.body]});

        if (validator.isValid()) {
            imposter.addStub(request.body);
            response.statusCode = 200;
            response.send();
        }
        else {
            response.statusCode = 400;
            response.send({ errors: validator.errors() });
        }
    }

    return {
        get: get,
        post: post
    };
}

module.exports = {
    create: create
};
