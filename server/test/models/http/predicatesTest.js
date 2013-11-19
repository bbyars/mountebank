'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/http/predicates');

describe('predicates', function () {
    describe('#is', function () {
        it('should return false for mismatched string', function () {
            assert.ok(!predicates.is('field', 'false', { field: 'true' }));
        });

        it('should return true for matching strings', function () {
            assert.ok(predicates.is('field', 'true', { field: 'true' }));
        });

        it('should be case insensitive', function () {
            assert.ok(predicates.is('field', 'TRUE', { field: 'true' }));
        });

        it('should match key-value pairs for objects', function () {
            assert.ok(predicates.is('headers', { key: 'value' }, { headers: { key: 'value' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.is('headers', { key: 'value' }, { headers: {}}));
        });

        it('should return false if mismatched key for object', function () {
            assert.ok(!predicates.is('headers', { key: 'true' }, { headers: { key: 'false' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.is('headers', { key: 'value' }, { headers: { key: 'VALUE' }}));
        });
    });
});
