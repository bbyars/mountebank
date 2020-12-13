'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    tcp = require('./tcpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters/:id', function () {
        promiseIt('should auto-assign port if port not provided', function () {
            const request = { protocol: 'tcp' };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);
                assert.ok(response.body.port > 0);
            }).finally(() => api.del('/imposters'));
        });
    });

    describe('GET /imposters/:id', function () {
        promiseIt('should provide access to all requests', function () {
            const request = { protocol: 'tcp', port };

            return api.post('/imposters', request)
                .then(() => tcp.fireAndForget('first', port))
                .then(() => tcp.fireAndForget('second', port))
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
                    const requests = response.body.requests.map(recordedRequest => recordedRequest.data);
                    assert.deepEqual(requests, ['first', 'second']);
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should return list of stubs in order', function () {
            const first = { responses: [{ is: { data: '1' } }] },
                second = { responses: [{ is: { data: '2' } }] },
                request = { protocol: 'tcp', port, stubs: [first, second] };

            return api.post('/imposters', request)
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
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
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should reflect default mode', function () {
            const request = { protocol: 'tcp', port, name: 'imposter' };

            return api.post('/imposters', request)
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
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
                })
                .finally(() => api.del('/imposters'));
        });
    });
});
