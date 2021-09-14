'use strict';

const assert = require('assert'),
    express = require('express'),
    createApp = require('mountebank').createApp,
    httpClient = require('../baseHttpClient').create('http'),
    port = parseInt(process.env.MB_PORT || 2525);

function listen (app) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            resolve({
                close: function () {
                    return new Promise(closeResolve => {
                        server.close(() => {
                            closeResolve();
                        });
                    });
                }
            });
        });

        server.on('error', e => reject(e));
    });
}

describe('Integration with existing server', function () {
    this.timeout(20000);

    let server;

    beforeEach(async function () {
        const app = express();
        const mbApp = await createApp({});

        app.get('/', (req, res) => {
            res.status(200).send('ok');
        });

        app.use('/mountebank', (req, res) => {
            mbApp(req, res);
        });

        server = await listen(app);
    });

    afterEach(async function () {
        await httpClient.del('/mountebank/imposters', port);
        await server.close();
    });

    it('should success respond on application path', async function () {
        const response = await httpClient.get('/', port);

        assert.strictEqual(response.body, 'ok');
    });

    it('should success respond on mountebank application path', async function () {
        const response = await httpClient.get('/mountebank/config', port);

        assert.strictEqual(response.body.options.port, port);
    });

    it('should return create new imposter with consistent hypermedia', async function () {
        const impostersPort = port + 1;
        const creationResponse = await httpClient.post('/mountebank/imposters', { protocol: 'http', port: impostersPort }, port);

        assert.strictEqual(creationResponse.statusCode, 201, JSON.stringify(creationResponse.body, null, 2));
        assert.strictEqual(creationResponse.headers.location, creationResponse.body._links.self.href);

        const imposterResponse = await httpClient.get(`/mountebank/imposters/${impostersPort}`, port);

        assert.strictEqual(imposterResponse.statusCode, 200);
        assert.deepEqual(imposterResponse.body, creationResponse.body);
    });
});
