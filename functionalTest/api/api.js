'use strict';

var http = require('http'),
    Q = require('q'),
    port = parseInt(process.env.MB_PORT || 2525),
    url = 'http://localhost:' + port,
    combinators = require('../../src/util/combinators');

Q.longStackSupport = true;

function optionsFor (spec) {
    var defaults = {
        hostname: 'localhost',
        port: port,
        headers: { accept: 'application/json' }
    };

    return combinators.merge(defaults, spec);
}

function responseFor (spec, body) {
    var deferred = Q.defer(),
        options = optionsFor(spec);

    if (body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    var request = http.request(options, function (response) {
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
    var spec = { method: 'GET', path: path };
    if (port) {
        spec.port = port;
    }
    return responseFor(spec);
}

function post (path, body, port) {
    var spec = { method: 'POST', path: path };
    if (port) {
        spec.port = port;
    }
    return responseFor(spec, body);
}

function del (path) {
    return responseFor({ method: 'DELETE', path: path });
}

module.exports = {
    url: url,
    port: port,
    get: get,
    post: post,
    del: del,
    responseFor: responseFor
};
