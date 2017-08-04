'use strict';

var assert = require('assert'),
    compatibility = require('../../src/models/compatibility');

describe('compatibility', function () {
    describe('#upcast', function () {
        it('should change string shellTransform to array', function () {
            var request = {
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
