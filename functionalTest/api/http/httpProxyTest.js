'use strict';

var assert = require('assert'),
    HttpProxy = require('../../../src/models/http/httpProxy'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    airplaneMode = process.env.MB_AIRPLANE_MODE === 'true';

describe('http proxy', function () {
    this.timeout(timeout);

    var noOp = function () {},
        logger = { debug: noOp, info: noOp, warn: noOp, error: noOp },
        proxy = HttpProxy.create(logger);

    describe('#to', function () {
        promiseIt('should send same request information to proxied url', function () {
            var proxyRequest = { protocol: 'http', port: port, name: this.name },
                request = { path: '/PATH', method: 'POST', body: 'BODY', headers: { 'X-Key': 'TRUE' } };

            return api.post('/imposters', proxyRequest).then(function () {
                return proxy.to('http://localhost:' + port, request, {});
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'did not get a 200 from proxy');

                return api.get('/imposters/' + port);
            }).then(function (response) {
                var requests = response.body.requests;
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].path, '/PATH');
                assert.strictEqual(requests[0].method, 'POST');
                assert.strictEqual(requests[0].body, 'BODY');
                assert.strictEqual(requests[0].headers['X-Key'], 'TRUE');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should return proxied result', function () {
            var stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' } }] },
                request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: {} }, {});
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'ERROR');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should proxy to https', function () {
            var stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' } }] },
                request = { protocol: 'https', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return proxy.to('https://localhost:' + port, { path: '/', method: 'GET', headers: {} }, {});
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'ERROR');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should update the host header to the origin server', function () {
            var stub = {
                    responses: [{ is: { statusCode: 400, body: 'ERROR' } }],
                    predicates: [{ equals: { headers: { host: 'localhost:' + port } } }]
                },
                request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: { host: 'www.mbtest.org' } }, {});
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'ERROR');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should capture response time to origin server', function () {
            var stub = { responses: [{ is: { body: 'ORIGIN' }, _behaviors: { wait: 250 } }] },
                request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: {} }, {});
            }).then(function (response) {
                assert.strictEqual(response.body, 'ORIGIN');
                assert.ok(response._proxyResponseTime > 230); // eslint-disable-line no-underscore-dangle
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        if (!airplaneMode) {
            promiseIt('should gracefully deal with DNS errors', function () {
                return proxy.to('http://no.such.domain', { path: '/', method: 'GET', headers: {} }, {}).then(function () {
                    assert.fail('should not have resolved promise');
                }, function (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Cannot resolve "http://no.such.domain"'
                    });
                });
            });

            promiseIt('should gracefully deal with bad urls', function () {
                return proxy.to('1 + 2', { path: '/', method: 'GET', headers: {} }, {}).then(function () {
                    assert.fail('should not have resolved promise');
                }, function (reason) {
                    assert.deepEqual(reason, {
                        code: 'invalid proxy',
                        message: 'Unable to connect to "1 + 2"'
                    });
                });
            });
        }


        ['application/octet-stream', 'audio/mpeg', 'audio/mp4', 'image/gif', 'image/jpeg', 'video/avi', 'video/mpeg'].forEach(function (mimeType) {
            promiseIt('should base64 encode ' + mimeType + ' responses', function () {
                var buffer = new Buffer([0, 1, 2, 3]),
                    stub = {
                        responses: [{
                            is: {
                                body: buffer.toString('base64'),
                                headers: { 'content-type': mimeType },
                                _mode: 'binary'
                            }
                        }]
                    },
                    request = { protocol: 'http', port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                    return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: {} }, {});
                }).then(function (response) {
                    assert.strictEqual(response.body, buffer.toString('base64'));
                    assert.strictEqual(response._mode, 'binary');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });
        });

        if (!airplaneMode) {
            promiseIt('should proxy to different host', function () {
                return proxy.to('https://google.com', { path: '/', method: 'GET', headers: {} }, {}).then(function (response) {
                    // sometimes 301, sometimes 302
                    assert.strictEqual(response.statusCode.toString().substring(0, 2), '30');

                    // https://www.google.com.br in Brasil, google.ca in Canada, etc
                    assert.ok(response.headers.Location.indexOf('google.') >= 0, response.headers.Location);
                });
            });
        }
    });
});
