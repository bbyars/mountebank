'use strict';

var ports = require('../util/ports'),
    Imposter = require('../models/imposter'),
    Q = require('q');

function create (protocols, imposters) {

    function protocolFor (protocolName) {
        var matches = protocols.filter(function (protocol) {
            return protocol.name === protocolName;
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function validate (protocol, port) {
        var errors = [];

        validateProtocol(protocol, errors);
        return validatePort(port, errors);
    }

    function validateProtocol(protocol, errors) {
        if (!protocol) {
            errors.push({
                code: "missing field",
                message: "'protocol' is a required field"
            });
        }
        if (protocol && !protocolFor(protocol)) {
            errors.push({
                code: "unsupported protocol",
                message: "Of course I can support the " + protocol + " protocol.  I have it on good authority that in just a few days, my team of open source contributors will have it ready for you!"
            });
        }
    }

    function validatePort(port, errors) {
        var deferred = Q.defer();

        if (!port) {
            errors.push({
                code: "missing field",
                message: "'port' is a required field"
            });
        }
        if (port && !ports.isValidPortNumber(port)) {
            errors.push({
                code: "bad data",
                message: "invalid value for 'port'"
            });
        }

        // Only check port availability if everything is good up to this point
        if (errors.length > 0) {
            deferred.reject(errors);
            return deferred.promise;
        }

        ports.isPortInUse(port).then(function (portConflict) {
            if (portConflict) {
                errors.push({
                    code: "port conflict",
                    message: "port already in use"
                });
                deferred.reject(errors);
            }
            else {
                deferred.resolve();
            }
        });
        return deferred.promise;
    }

    function get (request, response) {
        var result = imposters.reduce(function (accumulator, imposter) {
            return accumulator.concat(imposter.hypermedia(response));
        }, []);
        response.send({ imposters: result });
    }

    function post (request, response) {
        var protocol = request.body.protocol,
            port = request.body.port;

        validate(protocol, port).then(function () {
                Imposter.create(protocolFor(protocol), port).then(
                    function (imposter) {
                        imposters.push(imposter);
                        response.setHeader('Location', imposter.url(response));
                        response.statusCode = 201;
                        response.send(imposter.hypermedia(response));
                    });
            },
            function (errors) {
                response.statusCode = 400;
                response.send({errors: errors});
            });
    }

    return {
        get: get,
        post: post
    };
}

module.exports = {
    create: create
};
