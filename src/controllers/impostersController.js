'use strict';

/**
 * The controller that manages the list of imposters
 * @module
 */

/**
 * Creates the imposters controller
 * @param {Object} protocols - the protocol implementations supported by mountebank
 * @param {Object} imposters - The map of ports to imposters
 * @param {Object} Imposter - The factory for creating new imposters
 * @param {Object} logger - The logger
 * @param {Object} config - CLI configuration
 * @param {Boolean} config.allowInjection - Whether injection is allowed or not
 * @param {Boolean} config.recordRequests - Whether we should remember each request
 * @param {Boolean} config.recordMatches - Whether we should record detailed information about each predicate match
 * @returns {{get, post, del, put}}
 */
function create (protocols, imposters, Imposter, logger, config) {
    const exceptions = require('../util/errors'),
        helpers = require('../util/helpers');

    const queryIsFalse = (query, key) => !helpers.defined(query[key]) || query[key].toLowerCase() !== 'false';
    const queryBoolean = (query, key) => helpers.defined(query[key]) && query[key].toLowerCase() === 'true';

    function deleteAllImposters () {
        const Q = require('q'),
            ids = Object.keys(imposters),
            promises = ids.map(id => imposters[id].stop());

        ids.forEach(id => { delete imposters[id]; });
        return Q.all(promises);
    }

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
            valid = Q({ isValid: false, errors }),
            compatibility = require('../models/compatibility');

        compatibility.upcast(request);

        validatePort(request.port, errors);
        validateProtocol(request.protocol, errors);

        if (errors.length > 0) {
            return valid;
        }
        else {
            const Protocol = protocols[request.protocol],
                validator = require('../models/dryRunValidator').create({
                    testRequest: Protocol.testRequest,
                    testProxyResponse: Protocol.testProxyResponse,
                    additionalValidation: Protocol.validate,
                    allowInjection: config.allowInjection
                });
            return validator.validate(request, logger, {});
        }
    }

    function respondWithValidationErrors (response, validationErrors) {
        logger.warn(`error creating imposter: ${JSON.stringify(exceptions.details(validationErrors))}`);
        response.statusCode = 400;
        response.send({ errors: validationErrors });
    }

    function respondWithCreationError (response, error) {
        logger.warn(`error creating imposter: ${JSON.stringify(exceptions.details(error))}`);
        response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
        response.send({ errors: [error] });
    }

    function getJSON (options) {
        return Object.keys(imposters).reduce((accumulator, id) => accumulator.concat(imposters[id].toJSON(options)), []);
    }

    function requestDetails (request) {
        return `${helpers.socketName(request.socket)} => ${JSON.stringify(request.body)}`;
    }

    /**
     * The function responding to GET /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        response.format({
            json: () => {
                const url = require('url'),
                    query = url.parse(request.url, true).query,
                    options = {
                        replayable: queryBoolean(query, 'replayable'),
                        removeProxies: queryBoolean(query, 'removeProxies'),
                        list: !(queryBoolean(query, 'replayable') || queryBoolean(query, 'removeProxies'))
                    };

                response.send({ imposters: getJSON(options) });
            },
            html: () => {
                response.render('imposters', { imposters: getJSON() });
            }
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
        const protocol = request.body.protocol,
            validationPromise = validate(request.body);

        logger.debug(requestDetails(request));

        return validationPromise.then(validation => {
            const Q = require('q');

            if (validation.isValid) {
                return Imposter.create(protocols[protocol], request.body, logger.baseLogger, config.recordMatches, config.recordRequests, config.port).then(imposter => {
                    imposters[imposter.port] = imposter;
                    response.setHeader('Location', imposter.url);
                    response.statusCode = 201;
                    response.send(imposter.toJSON());
                }, error => {
                    respondWithCreationError(response, error);
                });
            }
            else {
                respondWithValidationErrors(response, validation.errors);
                return Q(false);
            }
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
            },
            json = getJSON(options);

        return deleteAllImposters().then(() => {
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

            if (isValid) {
                return deleteAllImposters().then(() => {
                    const creationPromises = requestImposters.map(imposter =>
                        Imposter.create(protocols[imposter.protocol], imposter, logger.baseLogger, config.recordMatches, config.recordRequests, config.port)
                    );
                    return Q.all(creationPromises);
                }).then(allImposters => {
                    const json = allImposters.map(imposter => imposter.toJSON({ list: true }));
                    allImposters.forEach(imposter => {
                        imposters[imposter.port] = imposter;
                    });
                    response.send({ imposters: json });
                }, error => {
                    respondWithCreationError(response, error);
                });
            }
            else {
                const validationErrors = validations.reduce((accumulator, validation) => accumulator.concat(validation.errors), []);
                respondWithValidationErrors(response, validationErrors);
                return Q(false);
            }
        });
    }

    return { get, post, del, put };
}

module.exports = { create };
