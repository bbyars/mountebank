'use strict';

var http = require('http'),
    Q = require('q'),
    port = process.env.MB_PORT || 2525,
    url = 'http://localhost:' + port;

var optionsFor = function (spec) {
    var result = {
        hostname: 'localhost',
        port: port,
        headers: {
            accept: 'application/json'
        }
    };

    Object.keys(spec).forEach(function (key) {
        result[key] = spec[key];
    });
    return result;
};

function responseFor (spec, body) {
    var deferred = Q.defer(),
        options = optionsFor(spec);

    if (body) {
        options.headers['Content-Type'] = 'application/json';
    }

    var request = http.request(options, function (response) {
        response.body = '';
        response.getLinkFor = function (rel) {
            return response.body.links.filter(function (link) {
                return link.rel === rel;
            })[0].href.replace(url, '');
        };
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            response.body += chunk;
        });
        response.on('end', function () {
            var contentType = response.headers['content-type'] || '';
            if (contentType.indexOf('application/json') === 0) {
                response.body = JSON.parse(response.body);
            }
            deferred.resolve(response);
        });
    });

    request.on('error', function (error) {
        deferred.reject(error);
    });

    if (body) {
        request.write(JSON.stringify(body));
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

function post (path, body) {
    return responseFor({ method: 'POST', path: path }, body);
}

function del (path) {
    return responseFor({ method: 'DELETE', path: path });
}

module.exports = {
    url: url,
    get: get,
    post: post,
    del: del
};
