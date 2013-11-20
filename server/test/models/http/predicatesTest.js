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

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.is('field', 1, { field: 1 }));
        });
    });

    describe('#contains', function () {
        it('should return false for request field not containing expected', function () {
            assert.ok(!predicates.contains('field', 'middle', { field: 'begin end' }));
        });

        it('should return true for request field containing expected', function () {
            assert.ok(predicates.contains('field', 'middle', { field: 'begin middle end' }));
        });

        it('should be case insensitive', function () {
            assert.ok(predicates.contains('field', 'MIDDLE', { field: 'begin middle end' }));
        });

        it('should match key-value pairs for objects', function () {
            assert.ok(predicates.contains('headers', { key: 'middle' }, { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.contains('headers', { key: 'middle' }, { headers: {}}));
        });

        it('should return false if key for object does not contain string', function () {
            assert.ok(!predicates.contains('headers', { key: 'middle' }, { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.contains('headers', { key: 'middle' }, { headers: { key: 'MIDDLE' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.contains('field', 1, { field: 1 }));
        });
    });

    describe('#startsWith', function () {
        it('should return false for request field not starting with expected', function () {
            assert.ok(!predicates.startsWith('field', 'middle', { field: 'begin middle end' }));
        });

        it('should return true for request field starting with expected', function () {
            assert.ok(predicates.startsWith('field', 'begin', { field: 'begin middle end' }));
        });

        it('should be case insensitive', function () {
            assert.ok(predicates.startsWith('field', 'BEGIN', { field: 'begin middle end' }));
        });

        it('should match key-value pairs for objects', function () {
            assert.ok(predicates.startsWith('headers', { key: 'begin' }, { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.startsWith('headers', { key: 'begin' }, { headers: {}}));
        });

        it('should return false if key for object does not start with string', function () {
            assert.ok(!predicates.startsWith('headers', { key: 'end' }, { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.startsWith('headers', { key: 'begin' }, { headers: { key: 'BEGIN end' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.startsWith('field', 1, { field: 1 }));
        });
    });

    describe('#endsWith', function () {
        it('should return false for request field not ending with expected', function () {
            assert.ok(!predicates.endsWith('field', 'middle', { field: 'begin middle end' }));
        });

        it('should return true for request field starting with expected', function () {
            assert.ok(predicates.endsWith('field', 'end', { field: 'begin middle end' }));
        });

        it('should be case insensitive', function () {
            assert.ok(predicates.endsWith('field', 'END', { field: 'begin middle end' }));
        });

        it('should match key-value pairs for objects', function () {
            assert.ok(predicates.endsWith('headers', { key: 'end' }, { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.endsWith('headers', { key: 'end' }, { headers: {}}));
        });

        it('should return false if key for object does not ending with string', function () {
            assert.ok(!predicates.endsWith('headers', { key: 'begin' }, { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.endsWith('headers', { key: 'END' }, { headers: { key: 'BEGIN end' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.endsWith('field', 1, { field: 1 }));
        });
    });

    describe('#matches', function () {
        it('should return false for request field not matching expected', function () {
            assert.ok(!predicates.matches('field', 'middle$', { field: 'begin middle end' }));
        });

        it('should return true for request field matching expected', function () {
            assert.ok(predicates.matches('field', 'end$', { field: 'begin middle end' }));
        });

        it('should match key-value pairs for objects', function () {
            assert.ok(predicates.matches('headers', { key: 'end$' }, { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.matches('headers', { key: 'end$' }, { headers: {}}));
        });

        it('should return false if key for object does not matches string', function () {
            assert.ok(!predicates.matches('headers', { key: 'begin\\d+' }, { headers: { key: 'begin end' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.matches('field', 1, { field: 1 }));
        });
    });
});
