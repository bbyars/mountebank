'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#not', function () {
        it('should return true for non empty request field if exists is true', function () {
            var predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'that' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty request field if exists is true', function () {
            var predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'this' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should throw exception if invalid sub-predicate', function () {
            try {
                var predicate = { not: { invalid: { field: 'this' } } },
                    request = { field: 'this' };
                predicates.evaluate(predicate, request);
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'missing predicate');
            }
        });
    });
});
