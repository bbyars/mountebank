'use strict';

var ports = require('../util/ports'),
    Imposter = require('../models/imposter');

function create (protocols, imposters) {

    function validationErrorsFor (protocol, port) {
        var errors = [];

        if (!port) {
            errors.push({
                code: "missing field",
                message: "'port' is a required field"
            });
        }
        if (!protocol) {
            errors.push({
                code: "missing field",
                message: "'protocol' is a required field"
            });
        }
        if (protocol && !protocols[protocol]) {
            errors.push({
                code: "unsupported protocol",
                message: "Of course I can support the " + protocol + " protocol.  I have it on good authority that in just a few days, my legion of open source contributors will have it ready for you!"
            });
        }
        return errors;
    }

    function get (request, response) {
        var result = imposters.reduce(function (accumulator, imposter) {
            return accumulator.concat(imposter.hypermedia(response));
        }, []);
        response.send({ imposters: result });
    }

    function post (request, response) {
        var protocol = request.body.protocol,
            port = request.body.port,
            errors = validationErrorsFor(protocol, port);

        if (errors.length > 0) {
            response.statusCode = 400;
            response.send({errors: errors});
        }
        else {
            var imposter = Imposter.create(protocol, port);
            imposters.push(imposter);
            response.setHeader('Location', response.absoluteUrl('/servers/' + port));
            response.statusCode = 201;
            response.send(imposter.hypermedia(response));
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
