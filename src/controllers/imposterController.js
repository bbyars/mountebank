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
            options = {
                replayable: queryBoolean(query, 'replayable'),
                removeProxies: queryBoolean(query, 'removeProxies')
            };

        return imposters.get(request.params.id).then(imposter => {
            return imposter.toJSON(options);
        }).then(json => {
            response.format({
                json: () => { response.send(json); },
                html: () => {
                    if (request.headers['x-requested-with']) {
                        response.render('_imposter', { imposter: json });
                    }
                    else {
                        response.render('imposter', { imposter: json });
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
            return imposters.stubsFor(request.params.id).deleteSavedProxyResponses()
                .then(() => imposter.toJSON(options));
        }).then(json => {
            response.format({
                json: () => { response.send(json); },
                html: () => {
                    if (request.headers['x-requested-with']) {
                        response.render('_imposter', { imposter: json });
                    }
                    else {
                        response.render('imposter', { imposter: json });
                    }
                }
            });
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
    function resetRequests (request, response) {
        return imposters.get(request.params.id).then(imposter => {
            return imposters.stubsFor(request.params.id).deleteSavedRequests()
                .then(() => imposter.toJSON());
        }).then(json => {
            response.format({
                json: () => { response.send(json); },
                html: () => {
                    if (request.headers['x-requested-with']) {
                        response.render('_imposter', { imposter: json });
                    }
                    else {
                        response.render('imposter', { imposter: json });
                    }
                }
            });
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
            options = {
                replayable: queryBoolean(query, 'replayable'),
                removeProxies: queryBoolean(query, 'removeProxies')
            };

        return imposters.get(request.params.id).then(imposter => {
            if (imposter) {
                return imposter.toJSON(options).then(json => {
                    return imposters.del(request.params.id).then(() => {
                        response.send(json);
                    });
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
        return imposters.get(request.params.id)
            .then(imposter => imposter.getResponseFor(request.body.request))
            .then(jsonResponse => response.send(jsonResponse));
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
        ).then(json => response.send(json));
    }

    function validateStubs (imposter, newStubs) {
        const errors = [],
            Q = require('q');

        if (!helpers.defined(newStubs)) {
            errors.push(exceptions.ValidationError("'stubs' is a required field"));
        }
        else if (!require('util').isArray(newStubs)) {
            errors.push(exceptions.ValidationError("'stubs' must be an array"));
        }

        if (errors.length > 0) {
            return Q({ isValid: false, errors });
        }

        return imposter.toJSON().then(request => {
            const compatibility = require('../models/compatibility'),
                Protocol = protocols[request.protocol],
                validator = require('../models/dryRunValidator').create({
                    testRequest: Protocol.testRequest,
                    testProxyResponse: Protocol.testProxyResponse,
                    additionalValidation: Protocol.validate,
                    allowInjection: allowInjection
                });

            request.stubs = newStubs;
            compatibility.upcast(request);
            return validator.validate(request, logger);
        });
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
        return imposters.get(request.params.id).then(imposter => {
            const stubs = imposters.stubsFor(request.params.id),
                newStubs = request.body.stubs;

            return validateStubs(imposter, newStubs).then(result => {
                if (!result.isValid) {
                    return respondWithValidationErrors(response, result.errors);
                }

                return stubs.overwriteAll(newStubs).then(() => {
                    return imposter.toJSON().then(json => response.send(json));
                });
            });
        });
    }

    function validateStubIndex (stubs, index) {
        return stubs.toJSON().then(allStubs => {
            const errors = [];
            if (typeof allStubs[index] === 'undefined') {
                errors.push(exceptions.ValidationError("'stubIndex' must be a valid integer, representing the array index position of the stub to replace"));
            }
            return { isValid: errors.length === 0, errors };
        });
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
        return imposters.get(request.params.id).then(imposter => {
            const stubs = imposters.stubsFor(request.params.id);

            return validateStubIndex(stubs, request.params.stubIndex).then(validation => {
                if (!validation.isValid) {
                    return respondWithValidationErrors(response, validation.errors, 404);
                }

                const newStub = request.body;
                return validateStubs(imposter, [newStub]).then(result => {
                    if (!result.isValid) {
                        return respondWithValidationErrors(response, result.errors);
                    }

                    return stubs.overwriteAtIndex(newStub, request.params.stubIndex)
                        .then(() => imposter.toJSON())
                        .then(json => response.send(json));
                });
            });
        });
    }

    function validateNewStubIndex (index, allStubs) {
        const errors = [];

        if (typeof index !== 'number' || index < 0 || index > allStubs.length) {
            errors.push(exceptions.ValidationError("'index' must be between 0 and the length of the stubs array"));
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
    function postStub (request, response) {
        return imposters.get(request.params.id).then(imposter => {
            const stubs = imposters.stubsFor(request.params.id);

            return stubs.toJSON().then(allStubs => {
                const newStub = request.body.stub,
                    index = typeof request.body.index === 'undefined' ? allStubs.length : request.body.index,
                    indexValidation = validateNewStubIndex(index, allStubs);

                logger.error(JSON.stringify(indexValidation));
                if (!indexValidation.isValid) {
                    return respondWithValidationErrors(response, indexValidation.errors);
                }

                return validateStubs(imposter, [newStub]).then(result => {
                    if (!result.isValid) {
                        return respondWithValidationErrors(response, result.errors);
                    }

                    return stubs.insertAtIndex(newStub, index).then(() => {
                        return imposter.toJSON().then(json => response.send(json));
                    });
                });
            });
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
        return imposters.get(request.params.id).then(imposter => {
            const stubs = imposters.stubsFor(request.params.id);

            return validateStubIndex(stubs, request.params.stubIndex).then(validation => {
                if (!validation.isValid) {
                    return respondWithValidationErrors(response, validation.errors, 404);
                }

                return stubs.deleteAtIndex(request.params.stubIndex).then(() => {
                    return imposter.toJSON().then(json => response.send(json));
                });
            });
        });
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
