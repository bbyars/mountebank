'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', () => {
    describe('#and', () => {
        it('should return true if all sub-predicate is true', () => {
            const predicate = { and: [{ equals: { field: 'this' } }, { startsWith: { field: 'th' } }] },
                request = { field: 'this' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if any sub-predicate is false', () => {
            const predicate = { and: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'this' };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
