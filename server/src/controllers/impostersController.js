'use strict'

var ports = require('../util/ports'),
    Imposter = require('../models/imposter');

function get (imposters) {
    return function (request, response) {
        var result = imposters.reduce(function (accumulator, imposter) {
           return accumulator.concat(imposter.hypermedia(response));
        }, []);
        response.send({ imposters: result });
    }
}

function post (imposters) {
    return function (request, response) {
        var port = request.body.port,
            protocol = request.body.protocol,
            imposter = Imposter.create(protocol, port);

        imposters.push(imposter);
        response.setHeader('Location', response.absoluteUrl('/servers/' + port));
        response.statusCode = 201;
        response.send(imposter.hypermedia(response));
    };
}

module.exports = {
    get: get,
    post: post
};
