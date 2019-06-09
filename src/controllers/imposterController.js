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
     * The function responding to GET /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        const url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') },
            imposter = imposters[request.params.id].toJSON(options);

        response.format({
            json: () => { response.send(imposter); },
            html: () => {
                if (request.headers['x-requested-with']) {
                    response.render('_imposter', { imposter: imposter });
                }
                else {
                    response.render('imposter', { imposter: imposter });
                }
            }
        });
    }

    /**
     * Corresponds to DELETE /imposters/:port/savedProxyResponses
     * Removes all saved proxy responses
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function resetProxies (request, response) {
        const Q = require('q'),
            json = {},
            options = { replayable: false, removeProxies: false };
        let imposter = imposters[request.params.id];

        if (imposter) {
            imposter.resetProxies();
            imposter = imposter.toJSON(options);

            response.format({
                json: () => { response.send(imposter); },
                html: () => {
                    if (request.headers['x-requested-with']) {
                        response.render('_imposter', { imposter: imposter });
                    }
                    else {
                        response.render('imposter', { imposter: imposter });
                    }
                }
            });
            return Q(true);
        }
        else {
            response.send(json);
            return Q(true);
        }
    }

    /**
     * The function responding to DELETE /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function del (request, response) {
        const Q = require('q'),
            imposter = imposters[request.params.id],
            url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };
        let json = {};

        if (imposter) {
            json = imposter.toJSON(options);
            return imposter.stop().then(() => {
                delete imposters[request.params.id];
                response.send(json);
            });
        }
        else {
            response.send(json);
            return Q(true);
        }
    }

    /**
     * The function responding to POST /imposters/:port/_requests
     * This is what protocol implementations call to send the JSON request
     * structure to mountebank, which responds with the JSON response structure
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function postRequest (request, response) {
        const imposter = imposters[request.params.id],
            protoRequest = request.body.request;

        imposter.getResponseFor(protoRequest).done(protoResponse => {
            response.send(protoResponse);
        });
    }

    /**
     * The function responding to POST /imposters/:port/_requests/:proxyResolutionKey
     * This is what protocol implementations call after proxying a request so
     * mountebank can record the response and add behaviors to it.
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function postProxyResponse (request, response) {
        const imposter = imposters[request.params.id],
            proxyResolutionKey = request.params.proxyResolutionKey,
            proxyResponse = request.body.proxyResponse;

        imposter.getProxyResponseFor(proxyResponse, proxyResolutionKey).done(protoResponse => {
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
        const errors = [],
            Q = require('q');

        validateStubs(newStubs, errors);
        if (errors.length > 0) {
            return Q({ isValid: false, errors });
        }

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

    function respondWithValidationErrors (response, validationErrors) {
        logger.error(`error changing stubs: ${JSON.stringify(exceptions.details(validationErrors))}`);
        response.statusCode = 400;
        response.send({ errors: validationErrors });
    }

    /**
     * The function responding to PUT /imposters/:port/stubs
     * Overwrites the stubs list without restarting the imposter
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} - promise for testing
     */
    function putStubs (request, response) {
        const imposter = imposters[request.params.id],
            newStubs = request.body.stubs;

        return validate(imposter, newStubs).then(result => {
            if (result.isValid) {
                imposter.overwriteStubs(newStubs);
                response.send(imposter.toJSON());
            }
            else {
                respondWithValidationErrors(response, result.errors);
            }
        });
    }

    /**
     * The function responding to PUT /imposters/:port/stubs/:stubIndex
     * Overwrites a single stub without restarting the imposter
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function putStub (request, response) {
        const imposter = imposters[request.params.id];
        response.send(imposter.toJSON());
    }

    /**
     * The function responding to POST /imposters/:port/stubs
     * Creates a single stub without restarting the imposter
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function postStub (request, response) {
        const imposter = imposters[request.params.id];
        response.send(imposter.toJSON());
    }

    /**
     * The function responding to DELETE /imposters/:port/stubs/:stubIndex
     * Removes a single stub without restarting the imposter
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function deleteStub (request, response) {
        const imposter = imposters[request.params.id];
        response.send(imposter.toJSON());
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
