'use strict';

const assert = require('assert'),
    httpRequest = require('../../../src/models/http/httpRequest'),
    events = require('events'),
    mock = require('../../mock').mock,
    inherit = require('../../../src/util/inherit');

describe('HttpRequest', function () {
    describe('#createFrom', function () {
        let request;

        beforeEach(() => {
            request = inherit.from(events.EventEmitter, {
                socket: { remoteAddress: '', remotePort: '' },
                setEncoding: mock(),
                url: 'http://localhost/',
                rawHeaders: []
            });
        });

        it('should set requestFrom from socket information', async function () {
            request.socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            const promise = httpRequest.createFrom(request)
                .then(mbRequest => assert.strictEqual(mbRequest.requestFrom, 'HOST:PORT'));

            request.emit('end');

            await promise;
        });

        it('should echo method from original request', async function () {
            request.method = 'METHOD';

            const promise = httpRequest.createFrom(request)
                .then(mbRequest => assert.strictEqual(mbRequest.method, 'METHOD'));

            request.emit('end');

            await promise;
        });

        it('should transform rawHeaders from original request, keeping case and duplicates', async function () {
            request.rawHeaders = [
                'Accept', 'text/plain',
                'Accept', 'TEXT/html',
                'accept', '*',
                'Host', '127.0.0.1:8000'
            ];

            const promise = httpRequest.createFrom(request)
                .then(mbRequest => assert.deepEqual(mbRequest.headers, {
                    Accept: ['text/plain', 'TEXT/html'],
                    accept: '*',
                    Host: '127.0.0.1:8000'
                }));

            request.emit('end');

            await promise;
        });

        it('should transform form', async function () {
            await shouldTransformForm('application/x-www-form-urlencoded');
        });

        it('should transform form for application/x-www-form-urlencoded;charset=UTF-8', async function () {
            await shouldTransformForm('application/x-www-form-urlencoded;charset=UTF-8');
        });

        it('should transform form for application/x-www-form-urlencoded; charset=UTF-8', async function () {
            await shouldTransformForm('application/x-www-form-urlencoded; charset=UTF-8');
        });

        it('should transform form with lowercased content-type header name', async function () {
            await shouldTransformForm('application/x-www-form-urlencoded', 'content-type');
        });

        async function shouldTransformForm (contentType, contentTypeHeader = 'Content-Type') {
            request.rawHeaders = [
                contentTypeHeader, contentType,
                'Host', '127.0.0.1:8000'
            ];

            const promise = httpRequest.createFrom(request).then(mbRequest => {
                assert.deepEqual(mbRequest.headers, {
                    Host: '127.0.0.1:8000',
                    [contentTypeHeader]: contentType
                });
                assert.deepEqual(mbRequest.form, {
                    firstname: 'ruud',
                    lastname: 'mountebank'
                });
            });

            request.emit('data', 'firstname=ruud&lastname=mountebank');
            request.emit('end');

            await promise;
        }

        it('should set path and query from request url', async function () {
            request.url = 'http://localhost/path?key=value';

            const promise = httpRequest.createFrom(request).then(mbRequest => {
                assert.strictEqual(mbRequest.path, '/path');
                assert.deepEqual(mbRequest.query, { key: 'value' });
            });

            request.emit('end');

            await promise;
        });

        it('should set body from data events', async function () {
            const promise = httpRequest.createFrom(request)
                .then(mbRequest => assert.strictEqual(mbRequest.body, '12'));

            request.emit('data', '1');
            request.emit('data', '2');
            request.emit('end');

            await promise;
        });

        it('should set body from data gzipped events', async function () {
            request.rawHeaders = [
                'Content-Encoding', 'gzip',
                'Host', '127.0.0.1:8000'
            ];

            const utf8TestContent = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ 色は匂へど散りぬるを';

            const promise = httpRequest.createFrom(request)
                .then(mbRequest => assert.strictEqual(mbRequest.body, utf8TestContent));

            const zlib = require('zlib');
            request.emit('data', zlib.gzipSync(utf8TestContent));
            request.emit('end');

            await promise;
        });
    });
});
