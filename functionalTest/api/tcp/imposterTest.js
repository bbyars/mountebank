'use strict';

var assert = require('assert'),
    api = require('../api'),
    tcp = require('./client'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000);

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('GET /imposters/:id', function () {
        promiseIt('should provide access to all requests', function () {
            return api.post('/imposters', { protocol: 'tcp', port: port }).then(function () {
                return tcp.fireAndForget('first', port);
            }).then(function () {
                return tcp.fireAndForget('second', port);
            }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                var requests = response.body.requests.map(function (request) {
                    return request.data;
                });
                assert.deepEqual(requests, ['first', 'second']);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return list of stubs in order', function () {
            var first = { responses: [{ is: { data: '1' }}]},
                second = { responses: [{ is: { data: '2' }}]};

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [first, second] }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body.stubs, [
                    { responses: [{ is: { data: '1' } }] },
                    { responses: [{ is: { data: '2' } }] }
                ]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should reflect default mode', function () {
            return api.post('/imposters', { protocol: 'tcp', port: port }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body, {
                    protocol: 'tcp',
                    port: port,
                    mode: 'text',
                    requests: [],
                    stubs: [],
                    _links: {
                        self: { href: api.url + '/imposters/' + port }
                    }
                });
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should record matches against stubs', function () {
            var stub = { responses: [{ is: { data: '1' }}, { is: { data: '2' }}]};

            return api.post('/imposters', { protocol: 'tcp', port: port, stubs: [stub] }).then(function () {
                return tcp.send('first', port);
            }).then(function () {
                return tcp.send('second', port);
            }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                var stubs = JSON.stringify(response.body.stubs),
                    withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                    withClientPortRemoved = withTimeRemoved.replace(/"port":\d+/g, '"port":0'),
                    actualWithoutEphemeralData = JSON.parse(withClientPortRemoved);

                assert.deepEqual(actualWithoutEphemeralData, [{
                    responses: [{ is: { data: '1' } }, { is: { data: '2' } }],
                    matches: [
                        {
                            timestamp: 'NOW',
                            request: { host: '127.0.0.1', port: 0, data: 'first' },
                            response: { data: '1' }
                        },
                        {
                            timestamp: 'NOW',
                            request: { host: '127.0.0.1', port: 0, data: 'second' },
                            response: { data: '2' }
                        }
                    ]
                }]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });
});
