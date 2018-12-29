'use strict';

const assert = require('assert'),
    httpRequest = require('../../../src/models/http/httpRequest'),
    promiseIt = require('../../testHelpers').promiseIt,
    events = require('events'),
    mock = require('../../mock').mock,
    inherit = require('../../../src/util/inherit');

describe('HttpRequest', function () {
    describe('#createFrom', function () {
        let request, container;

        beforeEach(() => {
            request = inherit.from(events.EventEmitter, {
                socket: { remoteAddress: '', remotePort: '' },
                setEncoding: mock(),
                url: 'http://localhost/',
                rawHeaders: []
            });
            container = { request: request };
        });

        promiseIt('should set requestFrom from socket information', function () {
            request.socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            const promise = httpRequest.createFrom(container).then(mbRequest => assert.strictEqual(mbRequest.requestFrom, 'HOST:PORT'));

            request.emit('end');

            return promise;
        });

        promiseIt('should echo method from original request', function () {
            request.method = 'METHOD';

            const promise = httpRequest.createFrom(container).then(mbRequest => assert.strictEqual(mbRequest.method, 'METHOD'));

            request.emit('end');

            return promise;
        });

        promiseIt('should transform rawHeaders from original request, keeping case and duplicates', function () {
            request.rawHeaders = [
                'Accept', 'text/plain',
                'Accept', 'TEXT/html',
                'accept', '*',
                'Host', '127.0.0.1:8000'
            ];

            const promise = httpRequest.createFrom(container).then(mbRequest => assert.deepEqual(mbRequest.headers, {
                Accept: ['text/plain', 'TEXT/html'],
                accept: '*',
                Host: '127.0.0.1:8000'
            }));

            request.emit('end');

            return promise;
        });

        promiseIt('should transform form', function () {
            return shouldTransformForm('application/x-www-form-urlencoded');
        });

        promiseIt('should transform form for application/x-www-form-urlencoded;charset=UTF-8', function () {
            return shouldTransformForm('application/x-www-form-urlencoded;charset=UTF-8');
        });

        promiseIt('should transform form for application/x-www-form-urlencoded; charset=UTF-8', function () {
            return shouldTransformForm('application/x-www-form-urlencoded; charset=UTF-8');
        });

        function shouldTransformForm (contentType) {
            request.rawHeaders = [
                'Content-Type', contentType,
                'Host', '127.0.0.1:8000'
            ];

            const promise = httpRequest.createFrom(container).then(mbRequest => {
                assert.deepEqual(mbRequest.headers, {
                    'Content-Type': contentType,
                    Host: '127.0.0.1:8000'
                });
                assert.deepEqual(mbRequest.form, {
                    firstname: 'ruud',
                    lastname: 'mountebank'
                });
            });

            request.emit('data', 'firstname=ruud&lastname=mountebank');
            request.emit('end');

            return promise;
        }

        promiseIt('should set path and query from request url', function () {
            request.url = 'http://localhost/path?key=value';

            const promise = httpRequest.createFrom(container).then(mbRequest => {
                assert.strictEqual(mbRequest.path, '/path');
                assert.deepEqual(mbRequest.query, { key: 'value' });
            });

            request.emit('end');

            return promise;
        });

        promiseIt('should set body from data events', function () {
            const promise = httpRequest.createFrom(container).then(mbRequest => assert.strictEqual(mbRequest.body, '12'));

            request.emit('data', '1');
            request.emit('data', '2');
            request.emit('end');

            return promise;
        });
    });
});
