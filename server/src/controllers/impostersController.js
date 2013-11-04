'use strict'

var ports = require('../util/ports'),
    Imposter = require('../models/imposter');

function create(protocols, imposters) {
    return {
        get: function get (request, response) {
            var result = imposters.reduce(function (accumulator, imposter) {
               return accumulator.concat(imposter.hypermedia(response));
            }, []);
            response.send({ imposters: result });
        },

        post: function post (request, response) {
            var port = request.body.port,
                protocol = request.body.protocol,
                imposter = Imposter.create(protocol, port);

            imposters.push(imposter);
            response.setHeader('Location', response.absoluteUrl('/servers/' + port));
            response.statusCode = 201;
            response.send(imposter.hypermedia(response));
        }
    };
}

module.exports = {
    create: create
};
