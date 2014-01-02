'use strict';

var port = parseInt(process.env.MB_PORT || 2525),
    httpClient = require('./http/baseHttpClient').create('http');

module.exports = {
    url: 'http://localhost:' + port,
    port: port,
    get: function (path) { return httpClient.get(path, port); },
    post: function (path, body) { return httpClient.post(path, body, port); },
    del: function (path) { return httpClient.del(path, port); }
};
