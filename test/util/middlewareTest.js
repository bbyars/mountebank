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

    describe('#useAbsoluteUrls', function () {
        var send, setHeader;

        beforeEach(function () {
            send = mock();
            setHeader = mock();
            response.send = send;
            response.setHeader = setHeader;
        });

        it('should not change header if not location header', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.setHeader('name', 'value');

            assert.ok(setHeader.wasCalledWith('name', 'value'));
        });

        it('should default location header to localhost with given port if no host header', function () {
            request.headers.host = '';
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.setHeader('location', '/');

            assert.ok(setHeader.wasCalledWith('location', 'http://localhost:9000/'));
        });

        it('should match location header regardless of case', function () {
            request.headers.host = '';
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.setHeader('LOCATION', '/');

            assert.ok(setHeader.wasCalledWith('LOCATION', 'http://localhost:9000/'));
        });

        it('should use the host header if present', function () {
            request.headers.host = 'mountebank.com';
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.setHeader('location', '/');

            assert.ok(setHeader.wasCalledWith('location', 'http://mountebank.com/'));
        });

        it('should do nothing if no response body links are present', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send({ key: 'value' });

            assert.ok(send.wasCalledWith({ key: 'value' }));
        });

        it('should do change response body links', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send({ key: 'value', _links: { rel: { href: '/' } } });

            assert.ok(send.wasCalledWith({ key: 'value', _links: { rel: { href: 'http://localhost:9000/' } } }));
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
