'use strict';

var assert = require('assert'),
    behaviors = require('../../../src/models/behaviors');

describe('behaviors', function () {
    describe('#repeat', function () {
        it('should not be valid if it is less than 0', function () {
            var errors = behaviors.validate({ repeat: 0 });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"repeat" value must be an integer greater than 0',
                source: { repeat: 0 }
            }]);
        });

        it('should not be valid if boolean', function () {
            var errors = behaviors.validate({ repeat: true });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"repeat" value must be an integer greater than 0',
                source: { repeat: true }
            }]);
        });
    });
});
