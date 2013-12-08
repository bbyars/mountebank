'use strict';

var winston = require('winston');

function useAbsoluteUrls (port) {
    return function (request, response, next) {
        var setHeaderOriginal = response.setHeader,
            sendOriginal = response.send,
            host = request.headers.host || 'localhost:' + port,
            absolutize = function (link) {
                return 'http://' + host + link;
            };

        response.setHeader = function () {
            var args = Array.prototype.slice.call(arguments);

            if (args[0] && args[0].toLowerCase() === 'location') {
                args[1] = absolutize(args[1]);
            }
            setHeaderOriginal.apply(this, args);
        };

        response.send = function () {
            var args = Array.prototype.slice.call(arguments),
                body = args[0];

            if (body && body._links) {
                Object.keys(body._links).forEach(function (rel) {
                    body._links[rel].href = absolutize(body._links[rel].href);
                });
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
                errors: [{
                    code: 'no such imposter',
                    message: 'Try POSTing to /imposters first?'
                }]
            });
        }
    };
}

function logger (format) {
    function shouldLog (request) {
        var isStaticAsset = (['.js', '.css', '.png'].some(function (fileType) {
                return request.url.indexOf(fileType) >= 0;
            })),
            isHtmlRequest = (request.headers.accept || '').indexOf('html') >= 0;

        return !(isStaticAsset || isHtmlRequest);
    }

    return function (request, response, next) {
        if (shouldLog(request)) {
            var message = format.replace(':method', request.method).replace(':url', request.url);
            winston.info(message);
        }
        next();
    };
}

module.exports = {
    useAbsoluteUrls: useAbsoluteUrls,
    createImposterValidator: createImposterValidator,
    logger: logger
};
