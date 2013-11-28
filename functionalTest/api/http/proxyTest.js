'use strict';

var assert = require('assert'),
    Proxy = require('../../../src/models/http/proxy'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1;

describe('proxy', function () {
    var proxy = Proxy.create();

    describe('#to', function () {
        promiseIt('should send same request information to proxied url', function () {
            return api.post('/imposters', { protocol: 'http', port: port }).then(function () {
                var request = { path: '/PATH', method: 'POST', body: 'BODY', headers: { 'X-Key': 'TRUE' }};
                return proxy.to('http://localhost:' + port, request);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'did not get a 200 from proxy');

                return api.get('/imposters/' + port + '/requests');
            }).then(function (response) {
                var requests = response.body.requests;
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].path, '/PATH');
                assert.strictEqual(requests[0].method, 'POST');
                assert.strictEqual(requests[0].body, 'BODY');
                assert.strictEqual(requests[0].headers['x-key'], 'TRUE');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return proxied result', function () {
            return api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' }}]};
                return api.post(response.getLinkFor('stubs'), stub);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: {} });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'ERROR');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should gracefully deal with DNS errors', function () {
            return proxy.to('http://no.such.domain', { path: '/', method: 'GET', headers: {} }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Cannot resolve http://no.such.domain'
                });
            });
        });

        promiseIt('should gracefully deal with bad urls', function () {
            return proxy.to('1 + 2', { path: '/', method: 'GET', headers: {} }).then(function () {
                assert.fail('should not have resolved promise');
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to 1 + 2'
                });
            });
        });

        promiseIt('should proxy to https', function () {
            var request = { method: 'GET', path: '/?q=mountebank', body: '', headers: {} };
            return proxy.to('https://google.com', request).then(function (response) {
                assert.strictEqual(response.statusCode, 301);
                assert.strictEqual(response.headers.location, 'https://www.google.com/?q=mountebank');
            });
        });
    });
});
