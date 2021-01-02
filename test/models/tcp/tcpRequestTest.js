'use strict';

const assert = require('assert'),
    TcpRequest = require('../../../src/models/tcp/tcpRequest');

describe('tcpRequest', function () {
    describe('#createFrom', function () {
        it('should echo data', async function () {
            const request = await TcpRequest.createFrom({ socket: {}, data: 'DATA' });

            assert.strictEqual(request.data, 'DATA');
        });

        it('should format requestFrom from socket', async function () {
            const socket = { remoteAddress: 'HOST', remotePort: 'PORT' },
                request = await TcpRequest.createFrom({ socket: socket, data: '' });

            assert.strictEqual(request.requestFrom, 'HOST:PORT');
        });
    });
});
