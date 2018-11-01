'use strict';

const add = (current, value) => Array.isArray(current) ? current.concat(value) : [current].concat(value);

const arrayifyIfExists = (current, value) => current ? add(current, value) : value;

const headersFor = rawHeaders => {
    const result = {};
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i];
        const value = rawHeaders[i + 1];
        result[name] = arrayifyIfExists(result[name], value);
    }
    return result;
};

const hasHeader = (headerName, headers) => Object.keys(headers).some(header => header.toLowerCase() === headerName.toLowerCase());

const headerNameFor = (headerName, headers) => {
    const helpers = require('../../util/helpers'),
        result = Object.keys(headers).find(header => header.toLowerCase() === headerName.toLowerCase());

    if (!helpers.defined(result)) {
        return headerName;
    }
    else {
        return result;
    }
};

const getJar = headers => ({
    get: header => headers[headerNameFor(header, headers)],
    set: (header, value) => {
        headers[headerNameFor(header, headers)] = value;
    }
});

module.exports = { headersFor, hasHeader, headerNameFor, getJar };
