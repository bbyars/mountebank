'use strict';

const assert = require('assert'),
    behaviors = require('../../../src/models/behaviors');

describe('behaviors', function () {
    describe('#repeat', function () {
        it('should not be valid if it is less than 0', function () {
            const errors = behaviors.validate([{ repeat: 0 }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'repeat behavior "repeat" field must be an integer greater than 0',
                source: { repeat: 0 }
            }]);
        });

        it('should not be valid if boolean', function () {
            const errors = behaviors.validate([{ repeat: true }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'repeat behavior "repeat" field must be a number',
                source: { repeat: true }
            }]);
        });
    });
});
