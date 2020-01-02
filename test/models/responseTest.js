'use strict';

const assert = require('assert'),
    Response = require('../../src/models/response');

describe('response', function () {
    describe('#setMetadata', function () {
        it('should add metadata to original responseConfig', function () {
            const responseConfig = { proxy: {} },
                response = Response.create(responseConfig, {});

            response.setMetadata('proxy', { key: 'value' });

            assert.deepEqual(responseConfig, { proxy: { key: 'value' } });
        });
    });
});
