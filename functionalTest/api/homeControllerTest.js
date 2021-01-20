'use strict';

const assert = require('assert'),
    api = require('./api').create();

describe('GET /', function () {
    it('should return correct hypermedia', async function () {
        const homeResponse = await api.get('/');
        assert.strictEqual(homeResponse.statusCode, 200);

        const links = homeResponse.body._links,
            impostersResponse = await api.get(links.imposters.href);
        assert.strictEqual(impostersResponse.statusCode, 200);

        const configResponse = await api.get(links.config.href);
        assert.strictEqual(configResponse.statusCode, 200);

        const logsResponse = await api.get(links.logs.href);
        assert.strictEqual(logsResponse.statusCode, 200);
    });
});
