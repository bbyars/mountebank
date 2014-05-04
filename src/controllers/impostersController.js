'use strict';

var Validator = require('../util/validator'),
    Q = require('q'),
    helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    url = require('url');

function create (protocols, imposters, Imposter, logger) {

    function deleteAllImposters () {
        Object.keys(imposters).forEach(function (id) {
            imposters[id].stop();
            delete imposters[id];
        });
    }

    function createValidator (request) {
        var protocol = request.protocol,
            port = request.port,
            Protocol = protocols[protocol],
            protocolSupport = {},
            validator;

        protocolSupport[protocol] = Protocol;
        validator = Validator.create({
            requiredFields: { protocol: protocol },
            requireValidPorts: { port: port },
            requireProtocolSupport: protocolSupport
        });

        if (validator.isValid() && Protocol.Validator) {
            return Protocol.Validator.create();
        }
        else {
            return validator;
        }
    }

    function get (request, response) {
        var query = url.parse(request.url, true).query,
            functionName = query.replayable ? 'toReplayableJSON' : 'toListJSON';

        var result = Object.keys(imposters).reduce(function (accumulator, id) {
            return accumulator.concat(imposters[id][functionName]());
        }, []);

        response.format({
            json: function () { response.send({ imposters: result }); },
            html: function () { response.render('imposters', { imposters: result }); }
        });
    }

    function post (request, response) {
        var protocol = request.body.protocol,
            validator = createValidator(request.body);

        logger.debug(helpers.socketName(request.socket) + ' => ' + JSON.stringify(request.body));

        return validator.validate(request.body, logger).then(function (validation) {
            if (validation.isValid) {
                return Imposter.create(protocols[protocol], request.body).then(function (imposter) {
                    imposters[imposter.port] = imposter;
                    response.setHeader('Location', imposter.url);
                    response.statusCode = 201;
                    response.send(imposter.toJSON());
                }, function (error) {
                    logger.warn('error creating imposter: ' + JSON.stringify(errors.details(error)));
                    response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
                    response.send({ errors: [error] });
                });
            }
            else {
                logger.warn('error creating imposter: ' + JSON.stringify(errors.details(validation.errors)));
                response.statusCode = 400;
                response.send({ errors: validation.errors });
                return Q(true);
            }
        });
    }

    function del (request, response) {
        var json = Object.keys(imposters).reduce(function (accumulator, id) {
            return accumulator.concat(imposters[id].toReplayableJSON());
        }, []);
        deleteAllImposters();
        response.send({ imposters: json });
    }

    function put (request, response) {
        var requestImposters = request.body.imposters || [],
            validationPromises = requestImposters.map(function (imposter) {
                var validator = createValidator(imposter);
                return validator.validate(imposter, logger);
            });

        logger.debug(helpers.socketName(request.socket) + ' => ' + JSON.stringify(request.body));

        return Q.all(validationPromises).then(function (validations) {
            var isValid =  validations.every(function (validation) {
                    return validation.isValid;
                });

            if (isValid) {
                deleteAllImposters();
                var creationPromises = request.body.imposters.map(function (imposter) {
                        return Imposter.create(protocols[imposter.protocol], imposter);
                    });

                return Q.all(creationPromises).then(function (allImposters) {
                    var json = allImposters.map(function (imposter) {
                        return imposter.toListJSON();
                    });
                    allImposters.forEach(function (imposter) {
                        imposters[imposter.port] = imposter;
                    });
                    response.send({ imposters: json });
                }, function (error) {
                    logger.warn('error creating imposter: ' + JSON.stringify(errors.details(error)));
                    response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
                    response.send({ errors: [error] });
                });
            }
            else {
                var validationErrors = validations.reduce(function (accumulator, validation) {
                        return accumulator.concat(validation.errors);
                    }, []);

                logger.warn('error creating imposter: ' + JSON.stringify(errors.details(validationErrors)));
                response.statusCode = 400;
                response.send({ errors: validationErrors });
            }
        });
    }

    return {
        get: get,
        post: post,
        del: del,
        put: put
    };
}

module.exports = {
    create: create
};
