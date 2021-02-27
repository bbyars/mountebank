'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    tcp = require('./tcpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('tcp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters/:id', function () {
        it('should auto-assign port if port not provided', async function () {
            const request = { protocol: 'tcp' };

            const response = await api.post('/imposters', request);

            assert.strictEqual(response.statusCode, 201);
            assert.ok(response.body.port > 0);
        });
    });

    describe('GET /imposters/:id', function () {
        it('should provide access to all requests', async function () {
            const request = { protocol: 'tcp', port };
            await api.createImposter(request);

            await tcp.fireAndForget('first', port);
            await tcp.fireAndForget('second', port);
            const response = await api.get(`/imposters/${port}`),
                requests = response.body.requests.map(recordedRequest => recordedRequest.data);

            assert.deepEqual(requests, ['first', 'second']);
        });

        it('should return list of stubs in order', async function () {
            const first = { responses: [{ is: { data: '1' } }] },
                second = { responses: [{ is: { data: '2' } }] },
                request = { protocol: 'tcp', port, stubs: [first, second] };
            await api.createImposter(request);

            const response = await api.get(`/imposters/${port}`);

            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body.stubs, [
                {
                    responses: [{ is: { data: '1' } }],
                    _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                },
                {
                    responses: [{ is: { data: '2' } }],
                    _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                }
            ]);
        });

        it('should reflect default mode', async function () {
            const request = { protocol: 'tcp', port, name: 'imposter' };
            await api.createImposter(request);

            const response = await api.get(`/imposters/${port}`);

            assert.strictEqual(response.statusCode, 200);
            assert.deepEqual(response.body, {
                protocol: 'tcp',
                port,
                recordRequests: false,
                numberOfRequests: 0,
                mode: 'text',
                name: request.name,
                requests: [],
                stubs: [],
                _links: {
                    self: { href: `${api.url}/imposters/${port}` },
                    stubs: { href: `${api.url}/imposters/${port}/stubs` }
                }
            });
        });
    });
});
