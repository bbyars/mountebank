'use strict';

var assert = require('assert'),
    Validator = require('../../../src/models/tcp/tcpValidator'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('httpValidator', function () {

    describe('#validate', function () {
        promiseIt('should be valid for missing mode', function () {
            var request = {},
                validator = Validator.create();

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        ['text', 'binary'].forEach(function (value) {
            promiseIt('should be valid for ' + value + ' mode', function () {
                var request = { mode: value },
                    validator = Validator.create();

                return validator.validate(request).then(function (result) {
                    assert.deepEqual(result, {
                        isValid: true,
                        errors: []
                    });
                });
            });
        });

        promiseIt('should not be valid for incorrect mode', function () {
            var request = { mode: 'TEXT' },
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
