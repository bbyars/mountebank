'use strict';

var Q = require('q'),
    url = require('url'),
    helpers = require('../../util/helpers'),
    xml2js = require('xml2js');

function getOperation (body) {
    var traverse = function (doc, key) {
            var namespacedKey = Object.keys(doc).filter(function (tagName) {
                    return tagName.toLowerCase().indexOf(':' + key) > 0;
                })[0];
            return doc[namespacedKey];
        },
        envelope = traverse(body, 'envelope'),
        soapBody = traverse(envelope, 'body'),
        operation = Object.keys(soapBody[0])[0];

    return operation.substring(operation.indexOf(':') + 1);
}

function transform (httpRequest, body) {
    var parts = url.parse(httpRequest.url, true);

    return {
        requestFrom: helpers.socketName(httpRequest.socket),
        method: httpRequest.method,
        path: parts.pathname,
        query: parts.query,
        headers: httpRequest.headers,
        body: httpRequest.body,
        operation: getOperation(body)
    };
}

function createFrom (httpRequest) {
    var deferred = Q.defer();
    httpRequest.body = '';
    httpRequest.setEncoding('utf8');
    httpRequest.on('data', function (chunk) { httpRequest.body += chunk; });
    httpRequest.on('end', function () {
        xml2js.parseString(httpRequest.body, function (error, body) {
            if (error) {
                throw error;
            }
            deferred.resolve(transform(httpRequest, body));
        });
    });
    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
