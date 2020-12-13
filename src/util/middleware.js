'use strict';

/**
 * Express middleware functions to inject into the HTTP processing
 * @module
 */

/**
 * Returns a middleware function to transforms all outgoing relative links in the response body
 * to absolute URLs, incorporating the current host name and port
 * @param {number} port - The port of the current instance
 * @returns {Function}
 */
function useAbsoluteUrls (port) {
    return function (request, response, next) {
        const setHeaderOriginal = response.setHeader,
            sendOriginal = response.send,
            host = request.headers.host || `localhost:${port}`,
            absolutize = link => `http://${host}${link}`,
            isObject = require('../util/helpers').isObject,
            util = require('util');

        response.setHeader = function () {
            const args = Array.prototype.slice.call(arguments);

            if (args[0] && args[0].toLowerCase() === 'location') {
                args[1] = absolutize(args[1]);
            }
            setHeaderOriginal.apply(this, args);
        };

        response.send = function () {
            const args = Array.prototype.slice.call(arguments),
                body = args[0],
                changeLinks = function (obj) {
                    if (obj._links) {
                        Object.keys(obj._links).forEach(function (rel) {
                            obj._links[rel].href = absolutize(obj._links[rel].href);
                        });
                    }
                },
                traverse = function (obj, fn, parent) {
                    if (parent === 'stubs' || parent === 'response') {
                        // Don't change _links within stubs or within the response
                        // sent back to protocol implementations
                        return;
                    }
                    fn(obj);
                    Object.keys(obj).forEach(key => {
                        if (obj[key] && isObject(obj[key])) {
                            traverse(obj[key], fn, key);
                        }
                    });
                };

            if (isObject(body)) {
                traverse(body, changeLinks);

                // Special case stubs _links. Hard to manage in the traverse function because stubs is an array
                // and we want to change stubs[]._links but not stubs[]._responses.is.body._links
                if (util.isArray(body.stubs)) {
                    body.stubs.forEach(changeLinks);
                }
                else if (util.isArray(body.imposters)) {
                    body.imposters.forEach(imposter => {
                        if (util.isArray(imposter.stubs)) {
                            imposter.stubs.forEach(changeLinks);
                        }
                    });
                }
            }
            sendOriginal.apply(this, args);
        };

        next();
    };
}

/**
 * Returns a middleware function to return a 404 if the imposter does not exist
 * @param {Object} imposters - The imposters repository
 * @returns {Function}
 */
function createImposterValidator (imposters) {
    return function validateImposterExists (request, response, next) {
        const errors = require('./errors');

        return imposters.exists(request.params.id).then(exists => {
            if (exists) {
                next();
            }
            else {
                response.statusCode = 404;
                response.send({
                    errors: [errors.MissingResourceError('Try POSTing to /imposters first?')]
                });
            }
        });
    };
}

/**
 * Returns a middleware function that logs the requests made to the server
 * @param {Object} log - The logger
 * @param {string} format - The log format
 * @returns {Function}
 */
function logger (log, format) {
    function shouldLog (request) {
        const isStaticAsset = (['.js', '.css', '.gif', '.png', '.ico'].some(function (fileType) {
                return request.url.indexOf(fileType) >= 0;
            })),
            isHtmlRequest = (request.headers.accept || '').indexOf('html') >= 0,
            isXHR = request.headers['x-requested-with'] === 'XMLHttpRequest';

        return !(isStaticAsset || isHtmlRequest || isXHR);
    }

    return function (request, response, next) {
        if (shouldLog(request)) {
            const message = format.replace(':method', request.method).replace(':url', request.url);
            if (request.url.indexOf('_requests') > 0) {
                // Protocol implementations communicating with mountebank
                log.debug(message);
            }
            else {
                log.info(message);
            }
        }
        next();
    };
}

/**
 * Returns a middleware function that passes global variables to all render calls without
 * having to pass them explicitly
 * @param {Object} vars - the global variables to pass
 * @returns {Function}
 */
function globals (vars) {
    return function (request, response, next) {
        const originalRender = response.render;
        response.render = function () {
            const args = Array.prototype.slice.call(arguments),
                variables = args[1] || {};

            Object.keys(vars).forEach(function (name) {
                variables[name] = vars[name];
            });
            args[1] = variables;
            originalRender.apply(this, args);
        };
        next();
    };
}

/**
 * The mountebank server uses header-based content negotiation to return either HTML or JSON
 * for each URL.  This breaks down on IE browsers as they fail to send the correct Accept header,
 * and since we default to JSON (to make the API easier to use), that leads to a poor experience
 * for IE users.  We special case IE to html by inspecting the user agent, making sure not to
 * interfere with XHR requests that do add the Accept header
 * @param {Object} request - The http request
 * @param {Object} response - The http response
 * @param {Function} next - The next middleware function to call
 */
function defaultIEtoHTML (request, response, next) {
    // IE has inconsistent Accept headers, often defaulting to */*
    // Our default is JSON, which fails to render in the browser on content-negotiated pages
    if (request.headers['user-agent'] && request.headers['user-agent'].indexOf('MSIE') >= 0) {
        if (!(request.headers.accept && request.headers.accept.match(/application\/json/))) {
            request.headers.accept = 'text/html';
        }
    }
    next();
}

/**
 * Returns a middleware function that defaults the content type to JSON if not set to make
 * command line testing easier (e.g. you don't have to set the Accept header with curl) and
 * parses the JSON before reaching a controller, handling errors gracefully.
 * @param {Object} log - The logger
 * @returns {Function}
 */
function json (log) {
    return function (request, response, next) {
        request.body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            request.body += chunk;
        });
        request.on('end', function () {
            const errors = require('./errors');

            if (request.body === '') {
                next();
            }
            else {
                try {
                    request.body = JSON.parse(request.body);
                    request.headers['content-type'] = 'application/json';
                    next();
                }
                catch (e) {
                    log.error('Invalid JSON: ' + request.body);
                    response.statusCode = 400;
                    response.send({
                        errors: [errors.InvalidJSONError({ source: request.body })]
                    });
                }
            }
        });
    };
}

module.exports = { useAbsoluteUrls, createImposterValidator, logger, globals, defaultIEtoHTML, json };
