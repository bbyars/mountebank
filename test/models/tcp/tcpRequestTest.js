'use strict';

var assert = require('assert'),
    TcpRequest = require('../../../src/models/tcp/tcpRequest');

describe('tcpRequest', function () {
    describe('#createFrom', function () {
        it('should echo parameters', function () {
            var request = TcpRequest.createFrom('REQUESTFROM', 'DATA');
            assert.deepEqual(request, {
                requestFrom: 'REQUESTFROM',
                data: 'DATA'
            });
        });
    });
});
