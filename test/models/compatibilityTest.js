'use strict';

const assert = require('assert'),
    compatibility = require('../../src/models/compatibility');

describe('compatibility', () => {
    describe('#upcast', () => {
        it('should change string shellTransform to array', () => {
            const request = {
                stubs: [{
                    responses: [{
                        _behaviors: { shellTransform: 'command' }
                    }]
                }]
            };

            compatibility.upcast(request);

            assert.deepEqual(request, {
                stubs: [{
                    responses: [{
                        _behaviors: { shellTransform: ['command'] }
                    }]
                }]
            });
        });
    });
});
