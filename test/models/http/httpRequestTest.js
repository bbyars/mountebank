'use strict';

var assert = require('assert'),
    httpRequest = require('../../../src/models/http/httpRequest'),
    promiseIt = require('../../testHelpers').promiseIt,
    events = require('events'),
    mock = require('../../mock').mock,
    inherit = require('../../../src/util/inherit');

describe('HttpRequest', function () {
    describe('#createFrom', function () {
        var request, container;

        beforeEach(function () {
            request = inherit.from(events.EventEmitter, {
                socket: { remoteAddress: '', remotePort: '' },
                setEncoding: mock(),
                url: 'http://localhost/'
            });
            container = { request: request };
        });

        promiseIt('should set requestFrom from socket information', function () {
            request.socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            var promise = httpRequest.createFrom(container).then(function (httpRequest) {
                assert.strictEqual(httpRequest.requestFrom, 'HOST:PORT');
            });

            request.emit('end');

            return promise;
        });

        promiseIt('should echo method and headers from original request', function () {
            request.method = 'METHOD';
            request.headers = 'HEADERS';

            var promise = httpRequest.createFrom(container).then(function (httpRequest) {
                assert.strictEqual(httpRequest.method, 'METHOD');
                assert.strictEqual(httpRequest.headers, 'HEADERS');
            });

            request.emit('end');

            return promise;
        });

        promiseIt('should set path and query from request url', function () {
            request.url = 'http://localhost/path?key=value';

            var promise = httpRequest.createFrom(container).then(function (httpRequest) {
                assert.strictEqual(httpRequest.path, '/path');
                assert.deepEqual(httpRequest.query, { key: 'value' });
            });

            request.emit('end');

            return promise;
        });

        promiseIt('should set body from data events', function () {
            var promise = httpRequest.createFrom(container).then(function (httpRequest) {
                assert.strictEqual(httpRequest.body, '12');
            });

            request.emit('data', '1');
            request.emit('data', '2');
            request.emit('end');

            return promise;
        });
    });
});
