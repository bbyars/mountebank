'use strict';

/**
 * Transforms a raw http request into an API-friendly soap request
 * @module
 */

var Q = require('q'),
    httpRequest = require('../http/httpRequest'),
    xml2js = require('xml2js');

function isArrayOfObjects (obj) {
    return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object';
}

function getNamespaces (body) {
    var map = {},
        collectNamespaces = function (obj) {
            Object.keys(obj).forEach(function (key) {
                if (key === '$') {
                    // xml2js key name for XML attributes
                    Object.keys(obj[key]).forEach(function (attributeName) {
                        if (attributeName.toLowerCase().indexOf('xmlns:') === 0) {
                            map[attributeName.replace('xmlns:', '')] = obj[key][attributeName];
                        }
                    });
                }
                else if (isArrayOfObjects(obj[key])) {
                    obj[key].forEach(collectNamespaces);
                }
                else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    collectNamespaces(obj[key]);
                }
            });
        };

    collectNamespaces(body);
    return map;
}

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

function getMethod (body, namespaces) {
    var soapBody = getSoapBody(body),
        operation = Object.keys(soapBody)[0],
        namespacePrefix = operation.substring(0, operation.indexOf(':')),
        namespaceURI = namespaces[namespacePrefix];

    if (!namespaceURI) {
        // assume an xmlns attribute on this node
        namespaceURI = soapBody[operation][0].$.xmlns;
    }

    return {
        name: operation.substring(operation.indexOf(':') + 1),
        URI: namespaceURI
    };
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

function transform (request, body) {
    var namespaces = getNamespaces(body);

    return {
        http: request,
        method: getMethod(body, namespaces),
        parameters: getParameters(body)
    };
}

/**
 * Transforms the raw http request into a mountebank soap request
 * @param {Object} request - The http request
 * @returns {Object}
 */
function createFrom (request) {
    var deferred = Q.defer();
    httpRequest.createFrom({ request: request }).done(function (parsedRequest) {
        xml2js.parseString(parsedRequest.body, function (error, body) {
            if (error) {
                throw error;
            }
            deferred.resolve(transform(parsedRequest, body));
        });
    });
    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
