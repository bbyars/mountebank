'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#and', function () {
        it('should return true if all sub-predicate is true', function () {
            var predicate = { and: [{ equals: { field: 'this' } }, { startsWith: { field: 'th' } }] },
                request = { field: 'this' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if any sub-predicate is false', function () {
            var predicate = { and: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'this' };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
