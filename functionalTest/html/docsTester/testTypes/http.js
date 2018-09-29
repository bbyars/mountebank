'use strict';

var Q = require('q'),
    util = require('util'),
    httpClient = require('../../../api/http/baseHttpClient').create('http');

function parseHeader (line) {
    var parts = line.split(':');
    return {
        key: parts[0].trim(),
        value: parts.slice(1).join(':').trim()
    };
}

function parse (text) {
    var lines = text.split('\n'),
        firstLineParts = lines[0].split(' '),
        spec = {
            method: firstLineParts[0],
            path: firstLineParts[1],
            headers: {},
            body: ''
        };

    for (var i = 1; i < lines.length; i += 1) {
        if (lines[i].trim() === '') {
            break;
        }
        var header = parseHeader(lines[i]);
        spec.headers[header.key] = header.value;
        if (header.key.toLowerCase() === 'host') {
            var parts = header.value.split(':');
            spec.hostname = parts[0];
            spec.port = parseInt(header.value.split(':')[1].trim());
        }
    }

    spec.body = lines.slice(i).join('\n').trim();
    return spec;
}

function messageFor (statusCode) {
    var codes = {
        200: 'OK',
        201: 'Created',
        400: 'Bad Request',
        404: 'Not Found',
        405: 'Method Not Allowed',
        406: 'Not Acceptable',
        500: 'Internal Server Error'
    };
    if (codes[statusCode]) {
        return codes[statusCode];
    }
    else {
        throw Error('unrecognized status code: ' + statusCode);
    }
}

function properCase (text) {
    var parts = text.split('-'),
        properCasedParts = parts.map(function (name) {
            return name.substring(0, 1).toUpperCase() + name.substring(1);
        });

    return properCasedParts.join('-');
}

function format (response) {
    var result = util.format('HTTP/1.1 %s %s', response.statusCode, messageFor(response.statusCode));
    Object.keys(response.headers).forEach(function (header) {
        result += util.format('\n%s: %s', properCase(header), response.headers[header]);
    });
    if (response.body) {
        result += '\n\n';
        if (typeof response.body === 'object') {
            result += JSON.stringify(response.body, null, 2);
        }
        else {
            result += response.body;
        }
    }
    return result;
}

function runStep (spec) {
    var deferred = Q.defer(),
        requestSpec = parse(spec.requestText);

    httpClient.responseFor(requestSpec).done(response => {
        deferred.resolve(format(response));
    });

    return deferred.promise;
}

module.exports = {
    runStep: runStep
};
