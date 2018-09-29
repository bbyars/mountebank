'use strict';

const assert = require('assert'),
    Validator = require('../../../src/models/tcp/tcpValidator'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('httpValidator', () => {

    describe('#validate', () => {
        promiseIt('should be valid for missing mode', () => {
            const request = {},
                validator = Validator.create();

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        ['text', 'binary'].forEach(function (value) {
            promiseIt('should be valid for ' + value + ' mode', () => {
                const request = { mode: value },
                    validator = Validator.create();

                return validator.validate(request).then(function (result) {
                    assert.deepEqual(result, {
                        isValid: true,
                        errors: []
                    });
                });
            });
        });

        promiseIt('should not be valid for incorrect mode', () => {
            const request = { mode: 'TEXT' },
                validator = Validator.create();

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: "'mode' must be one of ['text', 'binary']"
                    }]
                });
            });
        });
    });
});
