'use strict';

function createAbsoluteUrl (port) {
    return function (request, response, next) {
        var host = request.headers.host || 'localhost:' + port;
        response.absoluteUrl = function (endpoint) {
            return 'http://' + host + endpoint;
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
            response.send({ errors: [{
                code: "no such imposter",
                message: "I'm sure I can get someone to help you, but you have to ask first.  Try POSTing to /imposters?"
            }] });
        }
    }
}

module.exports = {
    createAbsoluteUrl: createAbsoluteUrl,
    createImposterValidator: createImposterValidator
};
