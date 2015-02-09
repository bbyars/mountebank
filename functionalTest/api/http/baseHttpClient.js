'use strict';

var Q = require('q'),
    helpers = require('../../../src/util/helpers');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function create (protocol) {
    function optionsFor (spec) {
        var defaults = {
                hostname: 'localhost',
                headers: { accept: 'application/json' },
                rejectUnauthorized: false
            };

        return helpers.merge(defaults, spec);
    }

    function responseFor (spec) {
        var deferred = Q.defer(),
            options = optionsFor(spec);

        if (!options.port) {
            throw Error('silly rabbit, you forgot to pass the port again');
        }

        if (spec.body && !options.headers['Content-Type'] && !spec.ignoreContentType) {
            options.headers['Content-Type'] = 'application/json';
        }

        var request = require(protocol).request(options, function (response) {
            response.body = '';
            response.setEncoding('utf8');
            response.on('data', function (chunk) { response.body += chunk; });
            response.on('end', function () {
                var contentType = response.headers['content-type'] || '';
                if (contentType.indexOf('application/json') === 0) {
                    response.body = JSON.parse(response.body);
                }
                deferred.resolve(response);
            });
        });

        request.on('error', deferred.reject);

        if (spec.body) {
            if (typeof(spec.body) === 'object') {
                request.write(JSON.stringify(spec.body));
            }
            else {
                request.write(spec.body);
            }
        }
        request.end();
        return deferred.promise;
    }

    function get (path, port) {
        return responseFor({ method: 'GET', path: path, port: port });
    }

    function post (path, body, port, ignoreContentType) {
        return responseFor({ method: 'POST', path: path, port: port, body: body, ignoreContentType: ignoreContentType });
    }

    function del (path, port) {
        return responseFor({ method: 'DELETE', path: path, port: port });
    }

    function put (path, body, port) {
        return responseFor({ method: 'PUT', path: path, port: port, body: body });
    }

    return {
        get: get,
        post: post,
        del: del,
        put: put,
        responseFor: responseFor
    };
}

module.exports = {
    create: create
};
