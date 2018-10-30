'use strict';

const assert = require('assert'),
    TcpRequest = require('../../../src/models/tcp/tcpRequest'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('tcpRequest', () => {
    describe('#createFrom', () => {
        promiseIt('should echo data', () => TcpRequest.createFrom({ socket: {}, data: 'DATA' }).then(request => {
            assert.strictEqual(request.data, 'DATA');
        }));

        it('should format requestFrom from socket', () => {
            const socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            return TcpRequest.createFrom({ socket: socket, data: '' }).then(request => {
                assert.strictEqual(request.requestFrom, 'HOST:PORT');
            });
        });
    });
});
