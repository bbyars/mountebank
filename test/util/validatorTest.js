'use strict';

var Validator = require('../../src/util/validator'),
    assert = require('assert');

describe('Validator', function () {

    describe('#isValid', function () {
        it('should be valid if no validations passed in', function () {
            var validator = Validator.create({});

            assert.ok(validator.isValid({}));
        });

        it('should not be valid if missing required field', function () {
            var validator = Validator.create({
                requiredFields: { key: undefined }
            });

            assert.ok(!validator.isValid());
        });

        it('should be valid if required field present', function () {
            var validator = Validator.create({
                requiredFields: { key: 'value' }
            });

            assert.ok(validator.isValid());
        });

        it('should not be valid for unsupported protocol', function () {
            var validator = Validator.create({
                requireProtocolSupport: { 'http': undefined }
            });

            assert.ok(!validator.isValid());
        });

        it('should be valid for supported protocol', function () {
            var validator = Validator.create({
                requireProtocolSupport: { 'http': 1 }
            });

            assert.ok(validator.isValid());
        });

        it('should not be valid for floating point port', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 12.34 }
            });

            assert.ok(!validator.isValid());
        });

        it('should not be valid for string port', function () {
            var validator = Validator.create({
                requireValidPorts: { port: "invalid" }
            });

            assert.ok(!validator.isValid());
        });

        it('should not be valid for a port number too low', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 0 }
            });

            assert.ok(!validator.isValid());
        });

        it('should be valid for lower end of possible ports', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 1 }
            });

            assert.ok(validator.isValid());
        });

        it('should be valid for upper end of possible ports', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 65535 }
            });

            assert.ok(validator.isValid());
        });

        it('should not be valid for a port number too high', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 65536 }
            });

            assert.ok(!validator.isValid());
        });

        it('should not be valid for non array', function () {
            var validator = Validator.create({
                requireNonEmptyArrays: { key: 'value' }
            });

            assert.ok(!validator.isValid());
        });

        it('should not be valid for empty array', function () {
            var validator = Validator.create({
                requireNonEmptyArrays: { key: [] }
            });

            assert.ok(!validator.isValid());
        });

        it('should be valid for non-empty array', function () {
            var validator = Validator.create({
                requireNonEmptyArrays: { key: [0] }
            });

            assert.ok(validator.isValid());
        });
    });

    describe('#errorsFor', function () {
        it('should include all missing required fields', function () {
            var validator = Validator.create({
                requiredFields: {
                    first: undefined,
                    second: 2,
                    third: undefined
                }
            });

            assert.deepEqual(validator.errors(), [
                { code: 'bad data', message: "'first' is a required field" },
                { code: 'bad data', message: "'third' is a required field" }
            ]);
        });

        it('should include an error for an unsupported protocol', function () {
            var validator = Validator.create({
                requireProtocolSupport: { 'http': undefined }
            });

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: 'the http protocol is not yet supported'
            }]);
        });

        it('should not include an error for unsupported protocol if the name is missing', function () {
            var validator = Validator.create({
                requireProtocolSupport: { undefined: undefined }
            });

            assert.deepEqual(validator.errors(), []);
        });

        it('should include an error for an invalid port', function () {
            var validator = Validator.create({
                requireValidPorts: { port: 'invalid' }
            });

            assert.deepEqual(validator.errors(), [{
                code: "bad data",
                message: "invalid value for 'port'"
            }]);
        });

        it('should not include an error for an invalid port if port is missing', function () {
            var validator = Validator.create({
                requireValidPorts: { port: undefined }
            });

            assert.deepEqual(validator.errors(), []);
        });

        it('should add error for non-empty array', function () {
            var validator = Validator.create({
                requireNonEmptyArrays: { key: [] }
            });

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: "'key' must be a non-empty array"
            }]);
        });
    });
});
