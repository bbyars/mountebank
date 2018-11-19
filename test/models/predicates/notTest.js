'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', () => {
    describe('#not', () => {
        it('should return true for non empty request field if exists is true', () => {
            const predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'that' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty request field if exists is true', () => {
            const predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'this' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should throw exception if invalid sub-predicate', () => {
            try {
                const predicate = { not: { invalid: { field: 'this' } } },
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
