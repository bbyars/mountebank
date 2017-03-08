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
    return Object.keys(headers).some(function (header) {
        return header.toLowerCase() === headerName.toLowerCase();
    });
}

function headerNameFor (headerName, headers) {
    var result = Object.keys(headers).find(function (header) {
        return header.toLowerCase() === headerName.toLowerCase();
    });
    if (typeof result === 'undefined') {
        result = headerName;
    }
    return result;
}

module.exports = {
    headersFor: headersFor,
    hasHeader: hasHeader,
    headerNameFor: headerNameFor
};
