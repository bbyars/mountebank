'use strict';

var http = require('http'),
    https = require('https'),
    url = require('url'),
    Q = require('q'),
    errors = require('../../errors/errors');

function create () {
    function to (baseUrl, originalRequest) {
        var deferred = Q.defer(),
            parts = url.parse(baseUrl),
            protocol = parts.protocol === 'https:' ? https : http,
            options = {
                method: originalRequest.method,
                hostname: parts.hostname,
                port: parts.port,
                auth: parts.auth,
                path: originalRequest.path,
                headers: originalRequest.headers
            },
            proxiedRequest;

        options.headers.connection = 'close';
        proxiedRequest = protocol.request(options, function (response) {
                response.body = '';
                response.setEncoding('utf8');
                response.on('data', function (chunk) {
                    response.body += chunk;
                });
                response.on('end', function () {
                    deferred.resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: response.body
                    });
                });
            });

        proxiedRequest.on('error', function (error) {
            if (error.code === 'ENOTFOUND') {
                deferred.reject(errors.InvalidProxyError('Cannot resolve ' + baseUrl));
            }
            else if (error.code === 'ECONNREFUSED') {
                deferred.reject(errors.InvalidProxyError('Unable to connect to ' + baseUrl));
            }
            else {
                deferred.reject(error);
            }
        });

        if (originalRequest.body) {
            proxiedRequest.write(originalRequest.body);
        }
        proxiedRequest.end();
        return deferred.promise;
    }

    return {
        to: to
    };
}

module.exports = {
    create: create
};
