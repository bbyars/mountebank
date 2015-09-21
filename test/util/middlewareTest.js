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

        it('should change response body links', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send({ key: 'value', _links: { rel: { href: '/' } } });

            assert.ok(send.wasCalledWith({ key: 'value', _links: { rel: { href: 'http://localhost:9000/' } } }));
        });

        it('should change response nested body links', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send({ key: { _links: { rel: { href: '/' } } } });

            assert.ok(send.wasCalledWith({ key: { _links: { rel: { href: 'http://localhost:9000/' } } } }));
        });

        it('should ignore null and undefined values', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send({ first: null, second: undefined });

            assert.ok(send.wasCalledWith({ first: null }));
        });

        it('should not change html responses', function () {
            var middlewareFn = middleware.useAbsoluteUrls(9000);

            middlewareFn(request, response, next);
            response.send('<html _links="/"></html>');

            assert.ok(send.wasCalledWith('<html _links="/"></html>'));
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

    describe('#logger', function () {
        it('should log request at info level', function () {
            var log = { info: mock() },
                request = { url: '', headers: { accept: '' } },
                middlewareFn = middleware.logger(log, 'TEST MESSAGE');

            middlewareFn(request, {}, next);

            assert(log.info.wasCalledWith('TEST MESSAGE'));
        });

        it('should log request url and method', function () {
            var log = { info: mock() },
                request = { method: 'METHOD', url: 'URL', headers: { accept: '' } },
                middlewareFn = middleware.logger(log, 'MESSAGE WITH :method :url');

            middlewareFn(request, {}, next);

            assert(log.info.wasCalledWith('MESSAGE WITH METHOD URL'));
        });

        it('should not log static asset requests', function () {
            var log = { info: mock() },
                middlewareFn = middleware.logger(log, 'TEST');

            ['.js', '.css', '.png', '.ico'].forEach(function (ext) {
                request = { url: 'file' + ext, headers: { accept: '' } };
                middlewareFn(request, {}, next);
                assert(!log.info.wasCalled());
            });
        });

        it('should not log html requests', function () {
            var log = { info: mock() },
                request = { method: 'METHOD', url: 'URL', headers: { accept: 'text/html' } },
                middlewareFn = middleware.logger(log, 'TEST');

            middlewareFn(request, {}, next);

            assert(!log.info.wasCalled());
        });

        it('should call next', function () {
            var log = { info: mock() },
                request = { url: '', headers: { accept: '' } },
                middlewareFn = middleware.logger(log, 'TEST');

            middlewareFn(request, {}, next);

            assert(next.wasCalled());
        });
    });

    describe('#globals', function () {
        it('should pass variables to all render calls', function () {
            var render = mock(),
                response = { render: render },
                middlewareFn = middleware.globals({ first: 1, second: 2 });

            middlewareFn({}, response, next);
            response.render('view');

            assert(render.wasCalledWith('view', { first: 1, second: 2 }));
        });

        it('should merge variables to all render calls', function () {
            var render = mock(),
                response = { render: render },
                middlewareFn = middleware.globals({ first: 1, second: 2 });

            middlewareFn({}, response, next);
            response.render('view', { third: 3 });

            assert(render.wasCalledWith('view', { third: 3, first: 1, second: 2 }));
        });

        it('should overwrite variables of the same name', function () {
            var render = mock(),
                response = { render: render },
                middlewareFn = middleware.globals({ key: 'global' });

            middlewareFn({}, response, next);
            response.render('view', { key: 'local' });

            assert(render.wasCalledWith('view', { key: 'global' }));
        });
    });

    describe('#defaultIEtoHTML', function () {
        it('should not change accept header for non-IE user agents', function () {
            request.headers['user-agent'] = 'blah Chrome blah';
            request.headers.accept = 'original accept';

            middleware.defaultIEtoHTML(request, {}, mock());

            assert.strictEqual(request.headers.accept, 'original accept');
        });

        it('should change accept header for IE user agents', function () {
            request.headers['user-agent'] = 'blah MSIE blah';
            request.headers.accept = '*/*';

            middleware.defaultIEtoHTML(request, response, next);

            assert.strictEqual(request.headers.accept, 'text/html');
        });

        it('should not change accept header for IE user agents if application/json explicitly included', function () {
            request.headers['user-agent'] = 'blah MSIE blah';
            request.headers.accept = 'accept/any, application/json';

            middleware.defaultIEtoHTML(request, response, next);

            assert.strictEqual(request.headers.accept, 'accept/any, application/json');
        });
    });
});
