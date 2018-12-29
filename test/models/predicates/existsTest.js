'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#exists', function () {
        it('should return true for integer request field if exists is true', function () {
            const predicate = { exists: { field: true } },
                request = { field: 0 };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true for object request field if exists is true', function () {
            const predicate = { exists: { field: true } },
                request = { field: {} };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true for non empty string request field if exists is true', function () {
            const predicate = { exists: { field: true } },
                request = { field: 'nonempty' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty string request field if exists is true', function () {
            const predicate = { exists: { field: true } },
                request = { field: '' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for undefined request field if exists is true', function () {
            const predicate = { exists: { field: true } },
                request = { field: undefined };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for integer request field if exists is false', function () {
            const predicate = { exists: { field: false } },
                request = { field: 0 };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for object request field if exists is false', function () {
            const predicate = { exists: { field: false } },
                request = { field: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for non empty string request field if exists is false', function () {
            const predicate = { exists: { field: false } },
                request = { field: 'nonempty' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for empty string request field if exists is false', function () {
            const predicate = { exists: { field: false } },
                request = { field: '' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true for undefined request field if exists is false', function () {
            const predicate = { exists: { field: false } },
                request = { field: undefined };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object and exists is true', function () {
            const predicate = { exists: { headers: { field: true } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if no key for object and exists is false', function () {
            const predicate = { exists: { headers: { field: false } } },
                request = { headers: {} };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true for non empty object key if exists is true', function () {
            const predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false for empty object key if exists is true', function () {
            const predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: '' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false for non empty object key if exists is false', function () {
            const predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for empty object key if exists is false', function () {
            const predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: '' } };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
