'use strict';

/**
 * The controller that manages the list of imposters
 * @module
 */

/**
 * Creates the imposters controller
 * @param {Object} protocols - the protocol implementations supported by mountebank
 * @param {Object} imposters - The imposters repository
 * @param {Object} logger - The logger
 * @param {Boolean} allowInjection - Whether injection is allowed or not
 * @returns {{get, post, del, put}}
 */
function create (protocols, imposters, logger, allowInjection) {
    const exceptions = require('../util/errors'),
        helpers = require('../util/helpers');

    const queryIsFalse = (query, key) => !helpers.defined(query[key]) || query[key].toLowerCase() !== 'false';
    const queryBoolean = (query, key) => helpers.defined(query[key]) && query[key].toLowerCase() === 'true';

    function validatePort (port, errors) {
        const portIsValid = !helpers.defined(port) || (port.toString().indexOf('.') === -1 && port > 0 && port < 65536);

        if (!portIsValid) {
            errors.push(exceptions.ValidationError("invalid value for 'port'"));
        }
    }

    function validateProtocol (protocol, errors) {
        const Protocol = protocols[protocol];

        if (!helpers.defined(protocol)) {
            errors.push(exceptions.ValidationError("'protocol' is a required field"));
        }
        else if (!Protocol) {
            errors.push(exceptions.ValidationError(`the ${protocol} protocol is not yet supported`));
        }
    }

    function validate (request) {
        const Q = require('q'),
            errors = [],
            compatibility = require('../models/compatibility');

        compatibility.upcast(request);

        validatePort(request.port, errors);
        validateProtocol(request.protocol, errors);

        if (errors.length > 0) {
            return Q({ isValid: false, errors });
        }
        else {
            const Protocol = protocols[request.protocol],
                validator = require('../models/dryRunValidator').create({
                    testRequest: Protocol.testRequest,
                    testProxyResponse: Protocol.testProxyResponse,
                    additionalValidation: Protocol.validate,
                    allowInjection: allowInjection
                });
            return validator.validate(request, logger);
        }
    }

    function respondWithValidationErrors (response, validationErrors) {
        logger.error(`error creating imposter: ${JSON.stringify(exceptions.details(validationErrors))}`);
        response.statusCode = 400;
        response.send({ errors: validationErrors });
    }

    function respondWithCreationError (response, error) {
        logger.error(`error creating imposter: ${JSON.stringify(exceptions.details(error))}`);
        response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
        response.send({ errors: [error] });
    }

    function requestDetails (request) {
        return `${helpers.socketName(request.socket)} => ${JSON.stringify(request.body)}`;
    }

    function getAllJSON (queryOptions) {
        const Q = require('q');
        return imposters.all().then(allImposters => {
            const promises = allImposters.map(imposter => imposter.toJSON(queryOptions));
            return Q.all(promises);
        });
    }

    /**
     * The function responding to GET /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - the promise
     */
    function get (request, response) {
        const url = require('url'),
            query = url.parse(request.url, true).query,
            options = {
                replayable: queryBoolean(query, 'replayable'),
                removeProxies: queryBoolean(query, 'removeProxies'),
                list: !(queryBoolean(query, 'replayable') || queryBoolean(query, 'removeProxies'))
            };

        return getAllJSON(options).then(impostersJSON => {
            response.format({
                json: () => { response.send({ imposters: impostersJSON }); },
                html: () => { response.render('imposters', { imposters: impostersJSON }); }
            });
        });
    }

    /**
     * The function responding to POST /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function post (request, response) {
        logger.debug(requestDetails(request));

        return validate(request.body).then(validation => {
            const Q = require('q'),
                protocol = request.body.protocol;

            if (!validation.isValid) {
                respondWithValidationErrors(response, validation.errors);
                return Q(false);
            }

            return protocols[protocol].createImposterFrom(request.body)
                .then(imposter => imposters.add(imposter))
                .then(imposter => {
                    response.setHeader('Location', imposter.url);
                    response.statusCode = 201;
                    return imposter.toJSON();
                }).then(json => {
                    response.send(json);
                }, error => {
                    respondWithCreationError(response, error);
                });
        });
    }

    /**
     * The function responding to DELETE /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function del (request, response) {
        const url = require('url'),
            query = url.parse(request.url, true).query,
            options = {
                // default to replayable for backwards compatibility
                replayable: queryIsFalse(query, 'replayable'),
                removeProxies: queryBoolean(query, 'removeProxies')
            };
        let json;

        return getAllJSON(options).then(impostersJSON => {
            json = impostersJSON;
            return imposters.deleteAll();
        }).then(() => {
            response.send({ imposters: json });
        });
    }

    /**
     * The function responding to PUT /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function put (request, response) {
        const Q = require('q'),
            requestImposters = request.body.imposters || [],
            validationPromises = requestImposters.map(imposter => validate(imposter));

        logger.debug(requestDetails(request));

        if (!('imposters' in request.body)) {
            respondWithValidationErrors(response, [
                exceptions.ValidationError("'imposters' is a required field")
            ]);
            return Q(false);
        }

        return Q.all(validationPromises).then(validations => {
            const isValid = validations.every(validation => validation.isValid);
            let allImposters;

            if (!isValid) {
                const validationErrors = validations.reduce((accumulator, validation) => accumulator.concat(validation.errors), []);
                respondWithValidationErrors(response, validationErrors);
                return Q(false);
            }

            return imposters.deleteAll().then(() => {
                const creationPromises = requestImposters.map(imposter =>
                    protocols[imposter.protocol].createImposterFrom(imposter)
                );
                return Q.all(creationPromises);
            }).then(all => {
                allImposters = all;
                return Q.all(allImposters.map(imposters.add));
            }).then(() => {
                const promises = allImposters.map(imposter => imposter.toJSON({ list: true }));
                return Q.all(promises);
            }).then(json => {
                response.send({ imposters: json });
            }, error => {
                respondWithCreationError(response, error);
            });
        });
    }

    return { get, post, del, put };
}

module.exports = { create };
