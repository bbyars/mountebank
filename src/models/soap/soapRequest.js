'use strict';

var Q = require('q'),
    url = require('url'),
    helpers = require('../../util/helpers'),
    xml2js = require('xml2js');

function getSoapBody (body) {
    var traverse = function (doc, key) {
            var namespacedKey = Object.keys(doc).filter(function (tagName) {
                return tagName.toLowerCase().indexOf(key) > 0;
            })[0];
            return doc[namespacedKey];
        },
        envelope = traverse(body, 'envelope');

    return traverse(envelope, 'body')[0];
}

function getMethodName (body) {
    var soapBody = getSoapBody(body),
        operation = Object.keys(soapBody)[0];

    return operation.substring(operation.indexOf(':') + 1);
}

function getParametersFrom (rootNode) {
    var parameters = {},
        children = Object.keys(rootNode).filter(function (key) {
            return key !== '$'; // used for attributes
        });

    children.forEach(function (child) {
        var value = rootNode[child][0];

        if (typeof value === 'object') {
            parameters[child] = getParametersFrom(value);
        }
        else if (typeof value === 'string') {
            parameters[child] = value;
        }
    });

    return parameters;
}

function getParameters (body) {
    var soapBody = getSoapBody(body),
        operation = Object.keys(soapBody)[0],
        operationNode = soapBody[operation][0];

    return getParametersFrom(operationNode);
}

function transform (httpRequest, body) {
    var parts = url.parse(httpRequest.url, true);

    return {
        http: {
            requestFrom: helpers.socketName(httpRequest.socket),
            method: httpRequest.method,
            path: parts.pathname,
            query: parts.query,
            headers: httpRequest.headers,
            body: httpRequest.body
        },
        methodName: getMethodName(body),
        parameters: getParameters(body)
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
