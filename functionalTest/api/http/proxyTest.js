'use strict';

var assert = require('assert'),
    Proxy = require('../../../src/models/http/proxy'),
    api = require('../api');

function doneCallback (done) {
    return function () { done(); };
}

function doneErrback (done) {
    return function (error) { done(error); };
}

describe('proxy', function () {
    var proxy = Proxy.create();

    describe('#to', function () {
        it('should send same request information to proxied url', function (done) {
            api.post('/imposters', { protocol: 'http', port: 4545 }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var request = { path: '/PATH', method: 'POST', body: 'BODY', headers: { 'X-Key': 'TRUE' }};
                return proxy.to('http://localhost:4545', request);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'did not get a 200 from proxy');

                return api.get('/imposters/4545/requests');
            }).then(function (response) {
                var requests = response.body.requests;
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].path, '/PATH');
                assert.strictEqual(requests[0].method, 'POST');
                assert.strictEqual(requests[0].body, 'BODY');
                assert.strictEqual(requests[0].headers['x-key'], 'TRUE');

                return api.del('/imposters/4545');
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should return proxied result', function (done) {
            api.post('/imposters', { protocol: 'http', port: 5555 }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var stub = { responses: [{ is: { statusCode: 400, body: 'ERROR' }}]};
                return api.post('/imposters/5555/stubs', stub);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return proxy.to('http://localhost:5555', { path: '/', method: 'GET', headers: {} });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'ERROR');

                return api.del('/imposters/5555');
            }).done(doneCallback(done), doneErrback(done));
        });

        it('should gracefully deal with DNS errors', function (done) {
            proxy.to('http://no.such.domain', { path: '/', method: 'GET', headers: {} }).done(function () {
                assert.fail('should not have resolved promise');
                done();
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Cannot resolve http://no.such.domain'
                });
                done();
            });
        });

        it('should gracefully deal with bad urls', function (done) {
            proxy.to('1 + 2', { path: '/', method: 'GET', headers: {} }).done(function () {
                assert.fail('should not have resolved promise');
                done();
            }, function (reason) {
                assert.deepEqual(reason, {
                    code: 'invalid proxy',
                    message: 'Unable to connect to 1 + 2'
                });
                done();
            });
        });

        it('should proxy to https');
    });
});
