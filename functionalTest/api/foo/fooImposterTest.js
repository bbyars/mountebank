'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    tcp = require('../tcp/tcpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('foo imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters/:id', function () {
        promiseIt('should auto-assign port if port not provided', function () {
            const request = { protocol: 'foo' };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);
                assert.ok(response.body.port > 0);
            }).finally(() => api.del('/imposters'));
        });
    });

    describe('GET /imposters/:id', function () {
        promiseIt('should provide access to all requests', function () {
            const imposterRequest = { protocol: 'foo', port };

            return api.post('/imposters', imposterRequest)
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
                    tcp.fireAndForget('first', port);
                })
                .then(() => tcp.fireAndForget('second', port))
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
                    const requests = response.body.requests.map(request => request.data);
                    assert.deepEqual(requests.sort(), ['first', 'second']);
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should return list of stubs in order', function () {
            const first = { responses: [{ is: { data: '1' } }] },
                second = { responses: [{ is: { data: '2' } }] },
                request = { protocol: 'foo', port, stubs: [first, second] };

            return api.post('/imposters', request).then(() => api.get(`/imposters/${port}`))
                .then(response => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.deepEqual(response.body.stubs, [
                        { responses: [{ is: { data: '1' } }] },
                        { responses: [{ is: { data: '2' } }] }
                    ]);
                })
                .finally(() => api.del('/imposters'));
        });

        promiseIt('should record matches against stubs', function () {
            const stub = { responses: [{ is: { data: '1' } }, { is: { data: '2' } }] },
                request = { protocol: 'foo', port, stubs: [stub] };

            return api.post('/imposters', request)
                .then(() => tcp.send('first', port))
                .then(() => tcp.send('second', port))
                .then(() => api.get(`/imposters/${port}`))
                .then(response => {
                    const stubs = JSON.stringify(response.body.stubs),
                        withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                        withClientPortRemoved = withTimeRemoved.replace(/"requestFrom":"[a-f:.\d]+"/g, '"requestFrom":"HERE"'),
                        actualWithoutEphemeralData = JSON.parse(withClientPortRemoved);

                    assert.deepEqual(actualWithoutEphemeralData, [{
                        responses: [{ is: { data: '1' } }, { is: { data: '2' } }],
                        matches: [
                            {
                                timestamp: 'NOW',
                                request: { requestFrom: 'HERE', data: 'first' },
                                response: { data: '1' }
                            },
                            {
                                timestamp: 'NOW',
                                request: { requestFrom: 'HERE', data: 'second' },
                                response: { data: '2' }
                            }
                        ]
                    }]);
                })
                .finally(() => api.del('/imposters'));
        });
    });
});
