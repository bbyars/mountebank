'use strict';

var Q = require('q'),
    util = require('util'),
    httpClient = require('../../api/http/baseHttpClient').create('http');

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
        options = {
            method: firstLineParts[0],
            path: firstLineParts[1],
            headers: {}
        },
        body;

    for (var i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') {
            break;
        }
        var header = parseHeader(lines[i]);
        options.headers[header.key] = header.value;
        if (header.key.toLowerCase() === 'host') {
            var parts = header.value.split(':');
            options.hostname = parts[0];
            options.port = parseInt(header.value.split(':')[1].trim());
        }
    }

    body = lines.slice(i).join('\n').trim();
    return {
        options: options,
        body: body
    };
}

function messageFor (statusCode) {
    var codes = {
        200: 'OK',
        201: 'Created',
        400: 'Bad Request'
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
        result += JSON.stringify(response.body, null, 2);
    }
    return result;
}

function runStep (step) {
    var deferred = Q.defer(),
        parsed = parse(step.execute);

    httpClient.responseFor(parsed.options, parsed.body).done(function (response) {
        step.result = format(response);
        deferred.resolve(step);
    });

    return deferred.promise;
}

function getExecutedDocs (spec) {
    var steps = spec.steps.map(function (step) {
        return function () { return runStep(step); };
    });

    return steps.reduce(Q.when, Q()).then(function () { return Q(spec); });
}

module.exports = {
    getExecutedDocs: getExecutedDocs
};
