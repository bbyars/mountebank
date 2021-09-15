'use strict';

const assert = require('assert'),
    express = require('express'),
    createApp = require('mountebank').createApp,
    httpClient = require('../baseHttpClient').create('http'),
    headers = { connection: 'close' }; // prevent hanging on to connections, delaying close

describe('Integration with existing server', function () {
    let server;
    let port;

    async function listen (app) {
        return new Promise((resolve, reject) => {
            server = app.listen(0, () => {
                resolve(server.address().port);
            });

            server.on('error', e => reject(e));
        });
    }

    async function close () {
        return new Promise(resolve => server.close(resolve));
    }

    beforeEach(async function () {
        const app = express();
        const mbApp = await createApp({ debug: true });

        app.get('/', (req, res) => {
            res.status(200).send('ok');
        });

        app.use('/mountebank', (req, res) => {
            mbApp(req, res);
        });

        port = await listen(app);
    });

    afterEach(async function () {
        await httpClient.del('/mountebank/imposters', port, headers);
        await close();
    });

    it('should success respond on application path', async function () {
        const response = await httpClient.get('/', port, headers);

        assert.strictEqual(response.body, 'ok');
    });

    it('should success respond on mountebank application path', async function () {
        const response = await httpClient.get('/mountebank/config', port, headers);

        assert.ok(response.body.options.debug);
    });

    it('should return create new imposter with consistent hypermedia', async function () {
        const creationResponse = await httpClient.post('/mountebank/imposters', { protocol: 'http' }, port, headers);
        const imposter = creationResponse.body;

        assert.strictEqual(creationResponse.statusCode, 201, JSON.stringify(imposter, null, 2));
        assert.strictEqual(creationResponse.headers.location, imposter._links.self.href);

        const imposterResponse = await httpClient.get(`/mountebank/imposters/${imposter.port}`, port, headers);

        assert.strictEqual(imposterResponse.statusCode, 200);
        assert.deepEqual(imposter, creationResponse.body);
    });
});
