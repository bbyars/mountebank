'use strict';

var Q = require('q'),
    helpers = require('../../../src/util/helpers');

function create (protocol) {
    function optionsFor (spec) {
        var defaults = {
            hostname: 'localhost',
            headers: { accept: 'application/json' },
            rejectUnauthorized: false
        };

        return helpers.merge(defaults, spec);
    }

    function responseFor (spec, body) {
        var deferred = Q.defer(),
            options = optionsFor(spec);

        if (!options.port) {
            throw Error('you forgot to pass the port again');
        }

        if (body && !options.headers['Content-Type']) {
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

        if (body) {
            if (options.headers['Content-Type'] === 'application/json') {
                request.write(JSON.stringify(body));
            }
            else {
                request.write(body);
            }
        }
        request.end();
        return deferred.promise;
    }

    function get (path, port) {
        return responseFor({ method: 'GET', path: path, port: port });
    }

    function post (path, body, port) {
        return responseFor({ method: 'POST', path: path, port: port }, body);
    }

    function del (path, port) {
        return responseFor({ method: 'DELETE', path: path, port: port });
    }

    return {
        get: get,
        post: post,
        del: del,
        responseFor: responseFor
    };
}

module.exports = {
    create: create
};
