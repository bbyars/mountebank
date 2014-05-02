'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 4000),
    BaseHttpClient = require('./baseHttpClient');

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters/:id', function () {
            promiseIt('should auto-assign port if port not provided', function () {
                var request = { protocol: protocol, name: this.name },
                    autoAssignedPort;

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    autoAssignedPort = response.body.port;
                    return client.get('/first', autoAssignedPort);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                }).finally(function () {
                    return api.del('/imposters/' + autoAssignedPort);
                });
            });
        });

        describe('GET /imposters/:id', function () {
            promiseIt('should provide access to all requests', function () {
                var request = { protocol: protocol, port: port, name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/first', port);
                }).then(function () {
                    return client.get('/second', port);
                }).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    var requests = response.body.requests.map(function (request) { return request.path; });
                    assert.deepEqual(requests, ['/first', '/second']);
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should return list of stubs in order', function () {
                var first = { responses: [{ is: { body: '1' }}]},
                    second = { responses: [{ is: { body: '2' }}]},
                    request = { protocol: protocol, port: port, stubs: [first, second], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                    assert.deepEqual(response.body.stubs, [
                        { responses: [{ is: { body: '1' } }] },
                        { responses: [{ is: { body: '2' } }] }
                    ]);
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should record matches against stubs', function () {
                var stub = { responses: [{ is: { body: '1' }}, { is: { body: '2' }}]},
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/first?q=1', port);
                }).then(function () {
                    return client.get('/second?q=2', port);
                }).then(function () {
                    return api.get('/imposters/' + port);
                }).then(function (response) {
                    var stubs = JSON.stringify(response.body.stubs),
                        withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                        withClientPortRemoved = withTimeRemoved.replace(/"requestFrom":"[:\.\d]+"/g, '"requestFrom":"HERE"'),
                        actualWithoutEphemeralData = JSON.parse(withClientPortRemoved),
                        requestHeaders = { accept: 'application/json', host: 'localhost:' + port, connection: 'keep-alive' };

                    assert.deepEqual(actualWithoutEphemeralData, [{
                        responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
                        matches: [
                            {
                                timestamp: 'NOW',
                                request: {
                                    requestFrom: 'HERE',
                                    path: '/first',
                                    query: { q: '1' },
                                    method: 'GET',
                                    headers: requestHeaders,
                                    body: ''
                                },
                                response: {
                                    statusCode: 200,
                                    headers: { connection: 'close' },
                                    body: '1'
                                }
                            },
                            {
                                timestamp: 'NOW',
                                request: {
                                    requestFrom: 'HERE',
                                    path: '/second',
                                    query: { q: '2'},
                                    method: 'GET',
                                    headers: requestHeaders,
                                    body: ''
                                },
                                response: {
                                    statusCode: 200,
                                    headers: { connection: 'close' },
                                    body: '2'
                                }
                            }
                        ]
                    }]);
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should return 404 if imposter has not been created', function () {
                return api.get('/imposters/3535').then(function (response) {
                    assert.strictEqual(response.statusCode, 404);
                });
            });
        });

        describe('DELETE /imposters/:id should shutdown server at that port', function () {
            promiseIt('should shutdown server at that port', function () {
                var request = { protocol: protocol, port: port, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    return api.del(response.headers.location);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'Delete failed');

                    return api.post('/imposters', { protocol: 'http', port: port });
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
                }).finally(function () {
                    return api.del('/imposters/' + port);
                });
            });

            promiseIt('should return a 200 even if the server does not exist', function () {
                return api.del('/imposters/9999').then(function (response) {
                    assert.strictEqual(response.statusCode, 200);
                });
            });
        });
    });
});
