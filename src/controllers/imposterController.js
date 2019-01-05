'use strict';

/**
 * The controller that gets and deletes single imposters
 * @module
 */

/**
 * Creates the imposter controller
 * @param {Object} imposters - the map of ports to imposters
 * @returns {{get, del}}
 */
function create (imposters) {
    function queryBoolean (query, key) {
        const helpers = require('../util/helpers');

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
     * @returns {Object} A promise for testing
     */
    function postRequest (request, response) {
        const imposter = imposters[request.params.id],
            protoRequest = request.body.request;

        return imposter.getResponseFor(protoRequest).then(protoResponse => {
            response.send(protoResponse);
        });
    }

    return { get, del, resetProxies, postRequest };
}

module.exports = { create };
