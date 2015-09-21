'use strict';

var errors = require('./errors');

function useAbsoluteUrls (port) {
    return function (request, response, next) {
        var setHeaderOriginal = response.setHeader,
            sendOriginal = response.send,
            host = request.headers.host || 'localhost:' + port,
            absolutize = function (link) { return 'http://' + host + link; };

        response.setHeader = function () {
            var args = Array.prototype.slice.call(arguments);

            if (args[0] && args[0].toLowerCase() === 'location') {
                args[1] = absolutize(args[1]);
            }
            setHeaderOriginal.apply(this, args);
        };

        response.send = function () {
            var args = Array.prototype.slice.call(arguments),
                body = args[0],
                changeLinks = function (obj) {
                    if (obj._links) {
                        Object.keys(obj._links).forEach(function (rel) {
                            obj._links[rel].href = absolutize(obj._links[rel].href);
                        });
                    }
                },
                traverse = function (obj, fn) {
                    fn(obj);
                    Object.keys(obj).forEach(function (key) {
                        if (obj[key] && typeof obj[key] === 'object') {
                            traverse(obj[key], fn);
                        }
                    });
                };

            if (typeof body === 'object') {
                traverse(body, changeLinks);
            }
            sendOriginal.apply(this, args);
        };

        next();
    };
}

function createImposterValidator (imposters) {
    return function validateImposterExists (request, response, next) {
        var imposter = imposters[request.params.id];

        if (imposter) {
            next();
        }
        else {
            response.statusCode = 404;
            response.send({
                errors: [errors.MissingResourceError('Try POSTing to /imposters first?')]
            });
        }
    };
}

function logger (log, format) {
    function shouldLog (request) {
        var isStaticAsset = (['.js', '.css', '.gif', '.png', '.ico'].some(function (fileType) {
                return request.url.indexOf(fileType) >= 0;
            })),
            isHtmlRequest = (request.headers.accept || '').indexOf('html') >= 0;

        return !(isStaticAsset || isHtmlRequest);
    }

    return function (request, response, next) {
        if (shouldLog(request)) {
            var message = format.replace(':method', request.method).replace(':url', request.url);
            log.info(message);
        }
        next();
    };
}

function globals (vars) {
    return function (request, response, next) {
        var originalRender = response.render;
        response.render = function () {
            var args = Array.prototype.slice.call(arguments),
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

function defaultIEtoHTML (request, response, next) {
    // IE has inconsistent Accept headers, often defaulting to */*
    // Our default is JSON, which fails to render in the browser on content-negotiated pages
    if (request.headers['user-agent'] && request.headers['user-agent'].indexOf('MSIE') >= 0) {
        if ( !(request.headers.accept && request.headers.accept.match(/application\/json/)) ) {
            request.headers.accept = 'text/html';
        }
    }
    next();
}

function json (logger) {
    return function (request, response, next) {
        // Accept requests even if no content type passed in to make command line testing easier
        request.body = '';
        request.setEncoding('utf8');
        request.on('data', function (chunk) {
            request.body += chunk;
        });
        request.on('end', function () {
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
                    logger.error('Invalid JSON: ' + request.body);
                    response.statusCode = 400;
                    response.send({
                        errors: [errors.InvalidJSONError({ source: request.body })]
                    });
                }
            }
        });
    };
}

module.exports = {
    useAbsoluteUrls: useAbsoluteUrls,
    createImposterValidator: createImposterValidator,
    logger: logger,
    globals: globals,
    defaultIEtoHTML: defaultIEtoHTML,
    json: json
};
