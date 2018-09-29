'use strict';

function add (current, value) {
    return Array.isArray(current) ? current.concat(value) : [current].concat(value);
}

function arrayifyIfExists (current, value) {
    return current ? add(current, value) : value;
}

function headersFor (rawHeaders) {
    var result = {};
    for (var i = 0; i < rawHeaders.length; i += 2) {
        var name = rawHeaders[i];
        var value = rawHeaders[i + 1];
        result[name] = arrayifyIfExists(result[name], value);
    }
    return result;
}

function hasHeader (headerName, headers) {
    return Object.keys(headers).some(header => header.toLowerCase() === headerName.toLowerCase());
}

function headerNameFor (headerName, headers) {
    var helpers = require('../../util/helpers'),
        result = Object.keys(headers).find(header => header.toLowerCase() === headerName.toLowerCase());

    if (!helpers.defined(result)) {
        return headerName;
    }
    else {
        return result;
    }
}

function getJar (headers) {
    return {
        get: header => headers[headerNameFor(header, headers)],
        set: function (header, value) {
            headers[headerNameFor(header, headers)] = value;
        }
    };
}

module.exports = {
    headersFor: headersFor,
    hasHeader: hasHeader,
    headerNameFor: headerNameFor,
    getJar: getJar
};
