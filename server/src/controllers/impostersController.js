'use strict';

var Imposter = require('../models/imposter');

function create (protocols, imposters) {

    function protocolFor (protocolName) {
        var matches = protocols.filter(function (protocol) {
            return protocol.name === protocolName;
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function isValid (protocol, port) {
        return errorsFor(protocol, port).length === 0;
    }

    function errorsFor (protocol, port) {
        var errors = [];

        addProtocolErrors(protocol, errors);
        addPortErrors(port, errors);
        return errors;
    }

    function addProtocolErrors (protocol, errors) {
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

    function addPortErrors (port, errors) {
        if (!port) {
            errors.push({
                code: "missing field",
                message: "'port' is a required field"
            });
        }
        if (port && !isValidPortNumber(port)) {
            errors.push({
                code: "bad data",
                message: "invalid value for 'port'"
            });
        }
    }

    function isValidPortNumber (port) {
        return typeof(port) !== 'undefined' &&
            port.toString().indexOf('.') === -1 &&
            port > 0 &&
            port < 65536;
    }

    function get (request, response) {
        var result = Object.keys(imposters).reduce(function (accumulator, id) {
            return accumulator.concat(imposters[id].hypermedia(response));
        }, []);
        response.send({ imposters: result });
    }

    function post (request, response) {
        var protocol = request.body.protocol,
            port = request.body.port;

        if (!isValid(protocol, port)) {
            response.statusCode = 400;
            response.send({errors: errorsFor(protocol, port)});
            return;
        }

        Imposter.create(protocolFor(protocol), port).then(function (imposter) {
            imposters[port] = imposter;
            response.setHeader('Location', imposter.url(response));
            response.statusCode = 201;
            response.send(imposter.hypermedia(response));
        }, function (error) {
            response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
            response.send({errors: [error]});
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
