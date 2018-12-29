'use strict';

const assert = require('assert'),
    validator = require('../../../src/models/tcp/tcpValidator');

describe('tcpValidator', function () {

    describe('#validate', function () {
        it('should be valid for missing mode', function () {
            assert.deepEqual(validator.validate({}), []);
        });

        ['text', 'binary'].forEach(value => {
            it(`should be valid for ${value} mode`, function () {
                assert.deepEqual(validator.validate({ mode: value }), []);
            });
        });

        it('should not be valid for incorrect mode', function () {
            assert.deepEqual(validator.validate({ mode: 'TEXT' }), [{
                code: 'bad data',
                message: "'mode' must be one of ['text', 'binary']"
            }]);
        });
    });
});
