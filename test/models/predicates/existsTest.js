'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#exists', function () {
        it('should return true for non empty request field if exists is true', function () {
            var predicate = { exists: { field: true } },
                request = { field: 'nonempty' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty request field if exists is true', function () {
            var predicate = { exists: { field: true } },
                request = { field: '' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for non empty request field if exists is false', function () {
            var predicate = { exists: { field: false } },
                request = { field: 'nonempty' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for empty request field if exists is false', function () {
            var predicate = { exists: { field: false } },
                request = { field: '' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object and exists is true', function () {
            var predicate = { exists: { headers: { field: true } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if no key for object and exists is false', function () {
            var predicate = { exists: { headers: { field: false } } },
                request = { headers: {} };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true for non empty object key if exists is true', function () {
            var predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty object key if exists is true', function () {
            var predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: '' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for non empty object key if exists is false', function () {
            var predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for empty object key if exists is false', function () {
            var predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: '' } };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
