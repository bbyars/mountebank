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

module.exports = {
    createAbsoluteUrl: createAbsoluteUrl
};
