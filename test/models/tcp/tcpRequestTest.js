'use strict';

var assert = require('assert'),
    TcpRequest = require('../../../src/models/tcp/tcpRequest'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('tcpRequest', function () {
    describe('#createFrom', function () {
        promiseIt('should echo data', function () {
            return TcpRequest.createFrom({ socket: {}, data: 'DATA' }).then(function (request) {
                assert.strictEqual(request.data, 'DATA');
            });
        });

        it('should format requestFrom from socket', function () {
            var socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            return TcpRequest.createFrom({ socket: socket, data: '' }).then(function (request) {
                assert.strictEqual(request.requestFrom, 'HOST:PORT');
            });
        });
    });
});
