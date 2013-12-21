//'use strict';
//
//var assert = require('assert'),
//    Proxy = require('../../../src/models/tcp/proxy'),
//    api = require('../api'),
//    net = require('net'),
//    Q = require('q'),
//    promiseIt = require('../../testHelpers').promiseIt,
//    port = api.port + 1,
//    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000);
//
//var tcp = {
//    send: function (message, port) {
//        var deferred = Q.defer(),
//            client = net.connect({ port: port }, function () {
//                client.end(message);
//            });
//
//        client.on('data', function (data) {
//            deferred.resolve(data);
//        });
//
//        return deferred.promise;
//    }
//};
//
//describe('tcp proxy', function () {
//    this.timeout(timeout);
//
//    var proxy = Proxy.create();
//
//    describe('#to', function () {
//        promiseIt('should send same request information to proxied socket', function () {
//            return api.post('/imposters', { protocol: 'tcp', port: port }).then(function () {
//                return proxy.to('localhost', port, 'hello, world!');
//            }).then(function () {
//                return api.get('/imposters/' + port);
//            }).then(function (response) {
//                var requests = response.body.requests;
//                    console.log(JSON.stringify(response.body));
//                assert.strictEqual(requests.length, 1);
//            }).finally(function () {
//                return api.del('/imposters/' + port);
//            });
//        });
//
////        promiseIt('should return proxied result', function () {
////            var stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' }}]};
////
////            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function (response) {
////                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));
////
////                return proxy.to('http://localhost:' + port, { path: '/', method: 'GET', headers: {} });
////            }).then(function (response) {
////                    assert.strictEqual(response.statusCode, 400);
////                    assert.strictEqual(response.body, 'ERROR');
////                }).finally(function () {
////                    return api.del('/imposters/' + port);
////                });
////        });
////
////        promiseIt('should gracefully deal with DNS errors', function () {
////            return proxy.to('http://no.such.domain', { path: '/', method: 'GET', headers: {} }).then(function () {
////                assert.fail('should not have resolved promise');
////            }, function (reason) {
////                assert.deepEqual(reason, {
////                    code: 'invalid proxy',
////                    message: 'Cannot resolve http://no.such.domain'
////                });
////            });
////        });
////
////        promiseIt('should gracefully deal with bad urls', function () {
////            return proxy.to('1 + 2', { path: '/', method: 'GET', headers: {} }).then(function () {
////                assert.fail('should not have resolved promise');
////            }, function (reason) {
////                assert.deepEqual(reason, {
////                    code: 'invalid proxy',
////                    message: 'Unable to connect to 1 + 2'
////                });
////            });
////        });
////
////        promiseIt('should proxy to https', function () {
////            var request = { method: 'GET', path: '/?q=mountebank', body: '', headers: {} };
////            return proxy.to('https://google.com', request).then(function (response) {
////                assert.strictEqual(response.statusCode, 301);
////                assert.strictEqual(response.headers.location, 'https://www.google.com/?q=mountebank');
////            });
////        });
//    });
//});
