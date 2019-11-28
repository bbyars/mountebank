'use strict';

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
    const exceptions = require('../util/errors'),
        helpers = require('../util/helpers');

    function queryBoolean (query, key) {
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
    function get (request, response) {
        const url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        return imposters.get(request.params.id).then(imposter => {
            response.format({
                json: () => { response.send(imposter.toJSON(options)); },
                html: () => {
                    if (request.headers['x-requested-with']) {
                        response.render('_imposter', { imposter: imposter.toJSON(options) });
                    }
                    else {
                        response.render('imposter', { imposter: imposter.toJSON(options) });
                    }
                }
            });
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
    function resetProxies (request, response) {
        const options = { replayable: false, removeProxies: false };

        return imposters.get(request.params.id).then(imposter => {
            if (imposter) {
                imposter.resetProxies();

                response.format({
                    json: () => { response.send(imposter.toJSON(options)); },
                    html: () => {
                        if (request.headers['x-requested-with']) {
                            response.render('_imposter', { imposter: imposter.toJSON(options) });
                        }
                        else {
                            response.render('imposter', { imposter: imposter.toJSON(options) });
                        }
                    }
                });
            }
            else {
                response.send({});
            }
        });
    }

    /**
     * The function responding to DELETE /imposters/:id
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function del (request, response) {
        const Q = require('q'),
            url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        return imposters.get(request.params.id).then(imposter => {
            if (imposter) {
                const json = imposter.toJSON(options);
                return imposters.del(request.params.id).then(() => {
                    response.send(json);
                });
            }
            else {
                response.send({});
                return Q(true);
            }
        });
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
    function postRequest (request, response) {
        return imposters.get(request.params.id).then(imposter =>
            imposter.getResponseFor(request.body.request)
        ).then(protoResponse => {
            response.send(protoResponse);
        });
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
    function postProxyResponse (request, response) {
        const proxyResolutionKey = request.params.proxyResolutionKey,
            proxyResponse = request.body.proxyResponse;

        return imposters.get(request.params.id).then(imposter =>
            imposter.getProxyResponseFor(proxyResponse, proxyResolutionKey)
        ).then(protoResponse => {
            response.send(protoResponse);
        });
    }

    function validateStubs (stubs, errors) {
        if (!helpers.defined(stubs)) {
            errors.push(exceptions.ValidationError("'stubs' is a required field"));
        }
        else if (!require('util').isArray(stubs)) {
            errors.push(exceptions.ValidationError("'stubs' must be an array"));
        }
    }

    function validate (imposter, newStubs) {
        const compatibility = require('../models/compatibility'),
            request = helpers.clone(imposter);

        request.stubs = newStubs;

        compatibility.upcast(request);

        const Protocol = protocols[request.protocol],
            validator = require('../models/dryRunValidator').create({
                testRequest: Protocol.testRequest,
                testProxyResponse: Protocol.testProxyResponse,
                additionalValidation: Protocol.validate,
                allowInjection: allowInjection
            });
        return validator.validate(request, logger);
    }

    function respondWithValidationErrors (response, validationErrors, statusCode = 400) {
        logger.error(`error changing stubs: ${JSON.stringify(exceptions.details(validationErrors))}`);
        response.statusCode = statusCode;
        response.send({ errors: validationErrors });
        return require('q')();
    }

    /**
     * The function responding to PUT /imposters/:id/stubs
     * Overwrites the stubs list without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    function putStubs (request, response) {
        const newStubs = request.body.stubs,
            errors = [];
        let imposter;

        validateStubs(newStubs, errors);
        if (errors.length > 0) {
            return respondWithValidationErrors(response, errors);
        }
        else {
            return imposters.get(request.params.id).then(retrieved => {
                imposter = retrieved;
                return validate(imposter, newStubs);
            }).then(result => {
                if (result.isValid) {
                    imposter.overwriteStubs(newStubs);
                    response.send(imposter.toJSON());
                }
                else {
                    respondWithValidationErrors(response, result.errors);
                }
            });
        }
    }

    function validateStubIndex (index, imposter, errors) {
        if (typeof imposter.stubs()[index] === 'undefined') {
            errors.push(exceptions.ValidationError("'stubIndex' must be a valid integer, representing the array index position of the stub to replace"));
        }
    }

    /**
     * The function responding to PUT /imposters/:id/stubs/:stubIndex
     * Overwrites a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    function putStub (request, response) {
        const newStub = request.body,
            errors = [];

        return imposters.get(request.params.id).then(imposter => {
            validateStubIndex(request.params.stubIndex, imposter, errors);
            if (errors.length > 0) {
                return respondWithValidationErrors(response, errors, 404);
            }
            else {
                return validate(imposter, [newStub]).then(result => {
                    if (result.isValid) {
                        imposter.overwriteStubAtIndex(newStub, request.params.stubIndex);
                        response.send(imposter.toJSON());
                    }
                    else {
                        respondWithValidationErrors(response, result.errors);
                    }
                });
            }
        });
    }

    /**
     * The function responding to POST /imposters/:port/stubs
     * Creates a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    function postStub (request, response) {
        return imposters.get(request.params.id).then(imposter => {
            const newStub = request.body.stub,
                index = typeof request.body.index === 'undefined' ? imposter.stubs().length : request.body.index,
                errors = [];

            if (typeof index !== 'number' || index < 0 || index > imposter.stubs().length) {
                errors.push(exceptions.ValidationError("'index' must be between 0 and the length of the stubs array"));
            }
            if (errors.length > 0) {
                return respondWithValidationErrors(response, errors);
            }
            else {
                return validate(imposter, [newStub]).then(result => {
                    if (result.isValid) {
                        imposter.insertStubAtIndex(newStub, index);
                        response.send(imposter.toJSON());
                    }
                    else {
                        respondWithValidationErrors(response, result.errors);
                    }
                });
            }
        });
    }

    /**
     * The function responding to DELETE /imposters/:port/stubs/:stubIndex
     * Removes a single stub without restarting the imposter
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    function deleteStub (request, response) {
        const errors = [];

        return imposters.get(request.params.id).then(imposter => {
            validateStubIndex(request.params.stubIndex, imposter, errors);
            if (errors.length > 0) {
                return respondWithValidationErrors(response, errors, 404);
            }
            else {
                imposter.deleteStubAtIndex(request.params.stubIndex);
                response.send(imposter.toJSON());
                return require('q')();
            }
        });
    }

    return {
        get,
        del,
        resetProxies,
        postRequest,
        postProxyResponse,
        putStubs,
        putStub,
        postStub,
        deleteStub
    };
}

module.exports = { create };
