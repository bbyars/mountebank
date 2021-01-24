'use strict';

const assert = require('assert'),
    validator = require('../../../src/models/tcp/tcpValidator');

describe('tcpValidator', function () {

    describe('#validate', function () {
        it('should be valid for missing mode', function () {
            assert.deepEqual(validator.validate({}), []);
        });

        it('should be valid for text mode', function () {
            assert.deepEqual(validator.validate({ mode: 'text' }), []);
        });

        it('should be valid for binary mode', function () {
            assert.deepEqual(validator.validate({ mode: 'binary' }), []);
        });

        it('should not be valid for incorrect mode', function () {
            assert.deepEqual(validator.validate({ mode: 'TEXT' }), [{
                code: 'bad data',
                message: "'mode' must be one of ['text', 'binary']"
            }]);
        });
    });
});
