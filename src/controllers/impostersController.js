'use strict';

const exceptions = require('../util/errors.js'),
    helpers = require('../util/helpers.js'),
    compatibility = require('../models/compatibility.js'),
    dryRunValidator = require('../models/dryRunValidator');

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
    function isFlagFalse (query, key) {
        return !helpers.defined(query[key]) || query[key].toLowerCase() !== 'false';
    }

    function isFlagSet (query, key) {
        return helpers.defined(query[key]) && query[key].toLowerCase() === 'true';
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
        const errors = [];

        compatibility.upcast(request);

        validatePort(request.port, errors);
        validateProtocol(request.protocol, errors);

        if (errors.length > 0) {
            return Promise.resolve({ isValid: false, errors });
        }
        else {
            const Protocol = protocols[request.protocol],
                validator = dryRunValidator.create({
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

    async function getAllJSON (queryOptions) {
        const allImposters = await imposters.all(),
            promises = allImposters.map(imposter => imposter.toJSON(queryOptions));
        return Promise.all(promises);
    }

    /**
     * The function responding to GET /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - the promise
     */
    async function get (request, response) {
        const options = {
                replayable: isFlagSet(request.query, 'replayable'),
                removeProxies: isFlagSet(request.query, 'removeProxies'),
                list: !(isFlagSet(request.query, 'replayable') || isFlagSet(request.query, 'removeProxies'))
            },
            impostersJSON = await getAllJSON(options);

        response.format({
            json: () => response.send({ imposters: impostersJSON }),
            html: () => response.render('imposters', { imposters: impostersJSON })
        });
    }

    /**
     * The function responding to POST /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    async function post (request, response) {
        logger.debug(requestDetails(request));
        const validation = await validate(request.body),
            protocol = request.body.protocol;

        if (validation.isValid) {
            try {
                const imposter = await protocols[protocol].createImposterFrom(request.body);
                await imposters.add(imposter);
                const json = await imposter.toJSON();

                response.setHeader('Location', imposter.url);
                response.statusCode = 201;
                response.send(json);
            }
            catch (error) {
                respondWithCreationError(response, error);
            }
        }
        else {
            respondWithValidationErrors(response, validation.errors);
        }
    }

    /**
     * The function responding to DELETE /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    async function del (request, response) {
        const options = {
                // default to replayable for backwards compatibility
                replayable: isFlagFalse(request.query, 'replayable'),
                removeProxies: isFlagSet(request.query, 'removeProxies')
            },
            json = await getAllJSON(options);

        await imposters.deleteAll();
        response.send({ imposters: json });
    }

    /**
     * The function responding to PUT /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    async function put (request, response) {
        const requestImposters = request.body.imposters || [],
            validationPromises = requestImposters.map(imposter => validate(imposter));

        logger.debug(requestDetails(request));

        if (!('imposters' in request.body)) {
            respondWithValidationErrors(response, [
                exceptions.ValidationError("'imposters' is a required field")
            ]);
            return false;
        }

        const validations = await Promise.all(validationPromises),
            isValid = validations.every(validation => validation.isValid);

        if (!isValid) {
            const validationErrors = validations.reduce((accumulator, validation) => accumulator.concat(validation.errors), []);
            respondWithValidationErrors(response, validationErrors);
            return false;
        }

        await imposters.deleteAll();
        try {
            const creationPromises = requestImposters.map(imposter =>
                    protocols[imposter.protocol].createImposterFrom(imposter)
                ),
                allImposters = await Promise.all(creationPromises);
            await Promise.all(allImposters.map(imposters.add));

            const promises = allImposters.map(imposter => imposter.toJSON({ list: true })),
                json = await Promise.all(promises);
            response.send({ imposters: json });
        }
        catch (error) {
            respondWithCreationError(response, error);
        }
        return true;
    }

    return { get, post, del, put };
}

module.exports = { create };
