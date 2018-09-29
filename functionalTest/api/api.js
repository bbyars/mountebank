'use strict';

const httpClient = require('./http/baseHttpClient').create('http');

function create (port) {
    port = port || parseInt(process.env.MB_PORT || 2525);

    return {
        url: 'http://localhost:' + port,
        port,
        get: function (path) { return httpClient.get(path, port); },
        post: function (path, body) { return httpClient.post(path, body, port); },
        del: function (path) { return httpClient.del(path, port); },
        put: function (path, body) { return httpClient.put(path, body, port); }
    };
}
module.exports = {
    create: create
};
