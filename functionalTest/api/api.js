'use strict';

const httpClient = require('./http/baseHttpClient').create('http');

function create (port) {
    port = port || parseInt(process.env.MB_PORT || 2525);

    return {
        url: `http://localhost:${port}`,
        port,
        get: path => httpClient.get(path, port),
        post: (path, body) => httpClient.post(path, body, port),
        del: path => httpClient.del(path, port),
        put: (path, body) => httpClient.put(path, body, port)
    };
}

module.exports = { create };
