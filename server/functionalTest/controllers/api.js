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

function responseFor (method, path, body) {
    var deferred = Q.defer(),
        options = optionsFor({method: method, path: path});

    var request = http.request(options, function (response) {
        response.body = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            response.body += chunk;
        });
        response.on('end', function () {
            response.body = JSON.parse(response.body);
            deferred.resolve(response);
        });
    });

    request.on('error', function (error) {
        console.log(error.message);
        deferred.reject();
    });

    if (body) {
        request.write(body.toString());
    }
    request.end();
    return deferred.promise;
}

function get (path) {
    return responseFor('GET', path);
}

function post (path, body) {
    return responseFor('POST', path, body);
}

module.exports = {
    url: url,
    get: get,
    post: post
};
