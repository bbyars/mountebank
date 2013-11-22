'use strict';

var middleware = require('../../src/util/middleware'),
    assert = require('assert'),
    mock = require('../mock').mock,
    FakeResponse = require('../fakes/fakeResponse');

describe('middleware', function () {
    var request, response,  next;

    beforeEach(function () {
        request = { headers: {}, params: {} };
        response = FakeResponse.create();
        next = mock();
    });

    describe('#createAbsoluteUrl', function () {
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
            var middlewareFn = middleware.createAbsoluteUrl(9000);

            middlewareFn(request, response, next);
            response.absoluteUrl('');

            assert(next.wasCalled());
        });
    });

    describe('#validateImposterExists', function () {
        it('should return 404 if imposter does not exist', function () {
            var middlewareFn = middleware.createImposterValidator({});
            request.params.id = 1;

            middlewareFn(request, response, next);

            assert.strictEqual(response.statusCode, 404);
        });

        it('should call next if imposter exists', function () {
            var imposters = { 1: {} },
                middlewareFn = middleware.createImposterValidator(imposters);
            request.params.id = 1;

            middlewareFn(request, response, next);

            assert(next.wasCalled());
        });
    });
});

