'use strict';

var middleware = require('../src/middleware'),
    assert = require('assert');

describe('middleware', function () {
    describe('#createAbsoluteUrl', function () {
        var request, response,  next;

        beforeEach(function () {
            request = { headers: {}};
            response = {};
            next = function () {};
        });

        it('should default to localhost with given port if no host header', function () {
            request.headers.host = '';
            var middlewareFn = middleware.createAbsoluteUrl(9000);

            middlewareFn(request, response, next);
            var url = response.absoluteUrl('');

            assert.strictEqual(url, 'http://localhost:9000');
        });

        it('should use host header if provides', function () {
            request.headers.host = 'test.com';
            var middlewareFn = middleware.createAbsoluteUrl(9000);

            middlewareFn(request, response, next);
            var url = response.absoluteUrl('');

            assert.strictEqual(url, 'http://test.com');
        });

        it('should append endpoint to url', function () {
            var middlewareFn = middleware.createAbsoluteUrl(9000);

            middlewareFn(request, response, next);
            var url = response.absoluteUrl('/test');

            assert.strictEqual(url, 'http://localhost:9000/test');
        });

        it('should call callback', function () {
            var middlewareFn = middleware.createAbsoluteUrl(9000),
                wasCalled = false;
            next = function () { wasCalled = true; };

            middlewareFn(request, response, next);
            response.absoluteUrl('');

            assert(wasCalled);
        });
    });
});

