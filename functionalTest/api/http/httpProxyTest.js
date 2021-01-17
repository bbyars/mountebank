'use strict';

const assert = require('assert'),
    HttpProxy = require('../../../src/models/http/httpProxy'),
    api = require('../api').create(),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('http proxy', function () {
    this.timeout(timeout);

    const noOp = () => {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp },
        proxy = HttpProxy.create(logger);

    describe('#to', function () {
        afterEach(async function () {
            await api.del('/imposters');
        });

        it('should send same request information to proxied url', async function () {
            const proxyRequest = { protocol: 'http', port },
                request = { path: '/PATH', method: 'POST', body: 'BODY', headers: { 'X-Key': 'TRUE' } };

            await api.post('/imposters', proxyRequest);
            const response = await proxy.to(`http://localhost:${port}`, request, {});
            assert.strictEqual(response.statusCode, 200, 'did not get a 200 from proxy');

            const mbResponse = await api.get(`/imposters/${port}`);
            const requests = mbResponse.body.requests;
            assert.strictEqual(requests.length, 1);
            assert.strictEqual(requests[0].path, '/PATH');
            assert.strictEqual(requests[0].method, 'POST');
            assert.strictEqual(requests[0].body, 'BODY');
            assert.strictEqual(requests[0].headers['X-Key'], 'TRUE');
        });

        it('should return proxied result', async function () {
            const stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' } }] },
                request = { protocol: 'http', port, stubs: [stub] },
                createResponse = await api.post('/imposters', request);

            assert.strictEqual(createResponse.statusCode, 201, JSON.stringify(createResponse.body));

            const response = await proxy.to(`http://localhost:${port}`, { path: '/', method: 'GET', headers: {} }, {});
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body, 'ERROR');
        });

        it('should proxy to https', async function () {
            const stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' } }] },
                request = { protocol: 'https', port, stubs: [stub] },
                createResponse = await api.post('/imposters', request);

            assert.strictEqual(createResponse.statusCode, 201, JSON.stringify(createResponse.body));

            const response = await proxy.to(`https://localhost:${port}`, { path: '/', method: 'GET', headers: {} }, {});
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body, 'ERROR');
        });

        it('should update the host header to the origin server', async function () {
            const stub = {
                    responses: [{ is: { statusCode: 400, body: 'ERROR' } }],
                    predicates: [{ equals: { headers: { host: `localhost:${port}` } } }]
                },
                request = { protocol: 'http', port, stubs: [stub] },
                createResponse = await api.post('/imposters', request);

            assert.strictEqual(createResponse.statusCode, 201, JSON.stringify(createResponse.body));

            const response = await proxy.to(`http://localhost:${port}`, { path: '/', method: 'GET', headers: { host: 'www.mbtest.org' } }, {});
            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body, 'ERROR');
        });

        if (!airplaneMode) {
            it('should gracefully deal with DNS errors', async function () {
                try {
                    await proxy.to('http://no.such.domain', { path: '/', method: 'GET', headers: {} }, {});
                    assert.fail('should not have resolved promise');
                }
                catch (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "http://no.such.domain"'
                    });
                }
            });

            it('should gracefully deal with bad urls', async function () {
                try {
                    await proxy.to('1 + 2', { path: '/', method: 'GET', headers: {} }, {});
                    assert.fail('should not have resolved promise');
                }
                catch (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Unable to connect to "1 + 2"'
                    });
                }
            });
        }


        ['application/octet-stream', 'audio/mpeg', 'audio/mp4', 'image/gif', 'image/jpeg', 'video/avi', 'video/mpeg'].forEach(mimeType => {
            it(`should base64 encode ${mimeType} responses`, async function () {
                const buffer = Buffer.from([0, 1, 2, 3]),
                    stub = {
                        responses: [{
                            is: {
                                body: buffer.toString('base64'),
                                headers: { 'content-type': mimeType },
                                _mode: 'binary'
                            }
                        }]
                    },
                    request = { protocol: 'http', port, stubs: [stub] };

                const createResponse = await api.post('/imposters', request);
                assert.strictEqual(createResponse.statusCode, 201, JSON.stringify(createResponse.body));

                const response = await proxy.to(`http://localhost:${port}`, { path: '/', method: 'GET', headers: {} }, {});
                assert.strictEqual(response.body, buffer.toString('base64'));
                assert.strictEqual(response._mode, 'binary');
            });
        });

        if (!airplaneMode) {
            it('should proxy to different host', async function () {
                const response = await proxy.to('https://google.com', { path: '/', method: 'GET', headers: {} }, {});
                // sometimes 301, sometimes 302
                assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');

                // https://www.google.com.br in Brasil, google.ca in Canada, etc
                assert.ok(response.headers.Location.indexOf('google.') >= 0, response.headers.Location);
            });
        }
    });
});
