'use strict';

const exceptions = require('../util/errors.js'),
    helpers = require('../util/helpers.js'),
    compatibility = require('../models/compatibility.js'),
    dryRunValidator = require('../models/dryRunValidator.js');

/**
 * The controller that gets and deletes single imposters
 * @module
 */

/**
 * Creates the imposter controller
 * @param {Object} protocols - the protocol implementations supported by mountebank
 * @param {Object} imposters - The map of ports to imposters
 * @param {Object} logger - The logger
 * @param {Boolean} allowInjection - Whether injection is allowed or not
 * @returns {{get, del}}
 */
function create (protocols, imposters, logger, allowInjection) {
    function isFlagSet (query, key) {
        if (!helpers.defined(query[key])) {
            return false;
        }
        return query[key].toLowerCase() === 'true';
    }

    /**
     * The function responding to GET /imposters/:id
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - the promise
     */
    async function get (request, response) {
        const options = {
                replayable: isFlagSet(request.query, 'replayable'),
                removeProxies: isFlagSet(request.query, 'removeProxies')
            },
            imposter = await imposters.get(request.params.id),
            json = await imposter.toJSON(options);

        response.format({
            json: () => response.send(json),
            html: () => response.render('imposter', { imposter: json })
        });
    }

    /**
     * Corresponds to DELETE /imposters/:id/savedProxyResponses
     * Removes all saved proxy responses
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    async function resetProxies (request, response) {
        const options = { replayable: false, removeProxies: false },
            imposter = await imposters.get(request.params.id);

        await imposters.stubsFor(request.params.id).deleteSavedProxyResponses();
        const json = await imposter.toJSON(options);

        response.format({
            json: () => response.send(json),
            html: () => response.render('imposter', { imposter: json })
        });
    }

    /**
     * Corresponds to DELETE /imposters/:id/savedRequests
     * Removes all saved requests
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    async function resetRequests (request, response) {
        const imposter = await imposters.get(request.params.id);
        await imposter.resetRequests();
        const json = await imposter.toJSON();

        response.format({
            json: () => response.send(json),
            html: () => response.render('imposter', { imposter: json })
        });
    }

    /**
     * The function responding to DELETE /imposters/:id
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    async function del (request, response) {
        const options = {
                replayable: isFlagSet(request.query, 'replayable'),
                removeProxies: isFlagSet(request.query, 'removeProxies')
            },
            imposter = await imposters.get(request.params.id);

        if (imposter) {
            const json = await imposter.toJSON(options);
            await imposters.del(request.params.id);
            response.send(json);
        }
        else {
            response.send({});
        }
    }

    /**
     * The function responding to POST /imposters/:id/_requests
     * This is what protocol implementations call to send the JSON request
     * structure to mountebank, which responds with the JSON response structure
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - the promise
     */
    async function postRequest (request, response) {
        const imposter = await imposters.get(request.params.id),
            jsonResponse = await imposter.getResponseFor(request.body.request);

        response.send(jsonResponse);
    }

    /**
     * The function responding to POST /imposters/:id/_requests/:proxyResolutionKey
     * This is what protocol implementations call after proxying a request so
     * mountebank can record the response and add behaviors to
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - the promise
     */
    async function postProxyResponse (request, response) {
        const proxyResolutionKey = request.params.proxyResolutionKey,
            proxyResponse = request.body.proxyResponse,
            imposter = await imposters.get(request.params.id),
            json = await imposter.getProxyResponseFor(proxyResponse, proxyResolutionKey);

        response.send(json);
    }

    async function validateStubs (imposter, newStubs) {
        const errors = [];

        if (!helpers.defined(newStubs)) {
            errors.push(exceptions.ValidationError("'stubs' is a required field"));
        }
        else if (!Array.isArray(newStubs)) {
            errors.push(exceptions.ValidationError("'stubs' must be an array"));
        }

        if (errors.length > 0) {
            return Promise.resolve({ isValid: false, errors });
        }

        const request = await imposter.toJSON(),
            Protocol = protocols[request.protocol],
            validator = dryRunValidator.create({
                testRequest: Protocol.testRequest,
                testProxyResponse: Protocol.testProxyResponse,
                additionalValidation: Protocol.validate,
                allowInjection: allowInjection
            });

        request.stubs = newStubs;
        compatibility.upcast(request);
        return validator.validate(request, logger);
    }

    function respondWithValidationErrors (response, validationErrors, statusCode = 400) {
        logger.error(`error changing stubs: ${JSON.stringify(exceptions.details(validationErrors))}`);
        response.statusCode = statusCode;
        response.send({ errors: validationErrors });
    }

    /**
     * The function responding to PUT /imposters/:id/stubs
     * Overwrites the stubs list without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    async function putStubs (request, response) {
        const imposter = await imposters.get(request.params.id),
            stubs = imposters.stubsFor(request.params.id),
            newStubs = request.body.stubs,
            result = await validateStubs(imposter, newStubs);

        if (result.isValid) {
            await stubs.overwriteAll(newStubs);
            const json = await imposter.toJSON();
            response.send(json);
        }
        else {
            respondWithValidationErrors(response, result.errors);
        }
    }

    async function validateStubIndex (stubs, index) {
        const allStubs = await stubs.toJSON();
        const errors = [];
        if (typeof allStubs[index] === 'undefined') {
            errors.push(exceptions.ValidationError("'stubIndex' must be a valid integer, representing the array index position of the stub to replace"));
        }
        return { isValid: errors.length === 0, errors };
    }

    /**
     * The function responding to PUT /imposters/:id/stubs/:stubIndex
     * Overwrites a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    async function putStub (request, response) {
        const imposter = await imposters.get(request.params.id),
            stubs = imposters.stubsFor(request.params.id),
            validation = await validateStubIndex(stubs, request.params.stubIndex);

        if (validation.isValid) {
            const newStub = request.body,
                result = await validateStubs(imposter, [newStub]);

            if (result.isValid) {
                await stubs.overwriteAtIndex(newStub, request.params.stubIndex);
                const json = await imposter.toJSON();
                response.send(json);
            }
            else {
                respondWithValidationErrors(response, result.errors);
            }
        }
        else {
            respondWithValidationErrors(response, validation.errors, 404);
        }
    }

    function validateNewStub (index, allStubs, newStub) {
        const errors = [];

        if (typeof index !== 'number' || index < 0 || index > allStubs.length) {
            errors.push(exceptions.ValidationError("'index' must be between 0 and the length of the stubs array"));
        }
        if (typeof newStub === 'undefined') {
            errors.push(exceptions.ValidationError("must contain 'stub' field"));
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * The function responding to POST /imposters/:port/stubs
     * Creates a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    async function postStub (request, response) {
        const imposter = await imposters.get(request.params.id),
            stubs = imposters.stubsFor(request.params.id),
            allStubs = await stubs.toJSON(),
            newStub = request.body.stub,
            index = typeof request.body.index === 'undefined' ? allStubs.length : request.body.index,
            validation = validateNewStub(index, allStubs, newStub);

        if (validation.isValid) {
            const result = await validateStubs(imposter, [newStub]);
            if (result.isValid) {
                await stubs.insertAtIndex(newStub, index);
                const json = await imposter.toJSON();
                response.send(json);
            }
            else {
                respondWithValidationErrors(response, result.errors);
            }
        }
        else {
            respondWithValidationErrors(response, validation.errors);
        }
    }

    /**
     * The function responding to DELETE /imposters/:port/stubs/:stubIndex
     * Removes a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    async function deleteStub (request, response) {
        const imposter = await imposters.get(request.params.id),
            stubs = imposters.stubsFor(request.params.id),
            validation = await validateStubIndex(stubs, request.params.stubIndex);

        if (validation.isValid) {
            await stubs.deleteAtIndex(request.params.stubIndex);
            const json = await imposter.toJSON();
            response.send(json);
        }
        else {
            respondWithValidationErrors(response, validation.errors, 404);
        }
    }

    return {
        get,
        del,
        resetProxies,
        resetRequests,
        postRequest,
        postProxyResponse,
        putStubs,
        putStub,
        postStub,
        deleteStub
    };
}

module.exports = { create };
