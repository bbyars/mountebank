'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#or', function () {
        it('should return true if any sub-predicate is true', function () {
            const predicate = { or: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'this' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no sub-predicate is true', function () {
            const predicate = { or: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'what' };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
