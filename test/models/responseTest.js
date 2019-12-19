'use strict';

const assert = require('assert'),
    Response = require('../../src/models/response');

describe('response', function () {
    describe('#recordMatch', function () {
        it('should support recording matches', function () {
            const responseConfig = {},
                stub = {},
                response = Response.create(responseConfig, stub),
                protoRequest = { field: 'request' },
                protoResponse = { field: 'response' };

            response.recordMatch(protoRequest, protoResponse);

            stub.matches[0].timestamp = 'NOW';
            assert.deepEqual(stub.matches, [{
                timestamp: 'NOW',
                request: { field: 'request' },
                response: { field: 'response' }
            }]);
        });

        it('should support record once even if called twice', function () {
            const responseConfig = {},
                stub = {},
                response = Response.create(responseConfig, stub),
                protoRequest = { field: 'request' },
                protoResponse = { field: 'response' };

            response.recordMatch(protoRequest, protoResponse);
            response.recordMatch(protoRequest, protoResponse);

            stub.matches[0].timestamp = 'NOW';
            assert.deepEqual(stub.matches, [{
                timestamp: 'NOW',
                request: { field: 'request' },
                response: { field: 'response' }
            }]);
        });

        it('should support delete proxy response time if present without affecting original response', function () {
            const responseConfig = {},
                stub = {},
                response = Response.create(responseConfig, stub),
                protoRequest = { field: 'request' },
                protoResponse = { field: 'response', _proxyResponseTime: 10 };

            response.recordMatch(protoRequest, protoResponse);

            stub.matches[0].timestamp = 'NOW';
            assert.deepEqual(stub.matches, [{
                timestamp: 'NOW',
                request: { field: 'request' },
                response: { field: 'response' }
            }]);
            assert.deepEqual(protoResponse, { field: 'response', _proxyResponseTime: 10 });
        });
    });

    describe('#setMetadata', function () {
        it('should add metadata to original responseConfig', function () {
            const responseConfig = { proxy: {} },
                response = Response.create(responseConfig, {});

            response.setMetadata('proxy', { key: 'value' });

            assert.deepEqual(responseConfig, { proxy: { key: 'value' } });
        });
    });
});
