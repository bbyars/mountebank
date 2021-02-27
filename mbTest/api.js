'use strict';

const httpClient = require('./baseHttpClient').create('http'),
    assert = require('assert');

function create (port) {
    port = port || parseInt(process.env.MB_PORT || 2525);

    function get (path) {
        return httpClient.get(path, port);
    }

    function post (path, body) {
        return httpClient.post(path, body, port);
    }

    function del (path) {
        return httpClient.del(path, port);
    }

    function put (path, body) {
        return httpClient.put(path, body, port);
    }

    async function createImposter (imposter) {
        const response = await post('/imposters', imposter);
        assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
        return response;
    }

    return {
        url: `http://localhost:${port}`,
        port,
        get, post, del, put,
        createImposter
    };
}

module.exports = { create };
