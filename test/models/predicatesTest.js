'use strict';

var assert = require('assert'),
    predicates = require('../../src/models/predicates');

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
            assert.ok(predicates.is('headers.key', 'value', { headers: { key: 'value' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.is('headers.key', 'value', { headers: {}}));
        });

        it('should return false if mismatched key for object', function () {
            assert.ok(!predicates.is('headers.key', 'true', { headers: { key: 'false' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.is('headers.key', 'value', { headers: { key: 'VALUE' }}));
        });

        it('should match keys in a case insensitive fashion for object', function () {
            assert.ok(predicates.is('headers.KEY', 'value', { headers: { key: 'value' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.is('field', 1, { field: 1 }));
        });

        it('should match missing field with empty string', function () {
            assert.ok(predicates.is('field', '', {}));
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
            assert.ok(predicates.contains('headers.key', 'middle', { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.contains('headers.key', 'middle', { headers: {}}));
        });

        it('should return false if key for object does not contain string', function () {
            assert.ok(!predicates.contains('headers.key', 'middle', { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.contains('headers.key', 'middle', { headers: { key: 'MIDDLE' }}));
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
            assert.ok(predicates.startsWith('headers.key', 'begin', { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.startsWith('headers.key', 'begin', { headers: {}}));
        });

        it('should return false if key for object does not start with string', function () {
            assert.ok(!predicates.startsWith('headers.key', 'end', { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.startsWith('headers.key', 'begin', { headers: { key: 'BEGIN end' }}));
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
            assert.ok(predicates.endsWith('headers.key', 'end', { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.endsWith('headers.key', 'end', { headers: {}}));
        });

        it('should return false if key for object does not ending with string', function () {
            assert.ok(!predicates.endsWith('headers.key', 'begin', { headers: { key: 'begin end' }}));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            assert.ok(predicates.endsWith('headers.key', 'END', { headers: { key: 'BEGIN end' }}));
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
            assert.ok(predicates.matches('headers.key', 'end$', { headers: { key: 'begin middle end' }}));
        });

        it('should return false if no key for object', function () {
            assert.ok(!predicates.matches('headers.key', 'end$', { headers: {}}));
        });

        it('should return false if key for object does not matches string', function () {
            assert.ok(!predicates.matches('headers.key', 'begin\\d+', { headers: { key: 'begin end' }}));
        });

        it('should return false for types other than strings and objects', function () {
            assert.ok(!predicates.matches('field', 1, { field: 1 }));
        });
    });

    describe('#exists', function () {
        it('should return true for non empty request field if exists is true', function () {
            assert.ok(predicates.exists('field', true, { field: 'nonempty' }));
        });

        it('should return false for empty request field if exists is true', function () {
            assert.ok(!predicates.exists('field', true, { field: '' }));
        });

        it('should return false for non empty request field if exists is false', function () {
            assert.ok(!predicates.exists('field', false, { field: 'nonempty' }));
        });

        it('should return true for empty request field if exists is false', function () {
            assert.ok(predicates.exists('field', false, { field: '' }));
        });

        it('should return false if no key for object and exists is true', function () {
            assert.ok(!predicates.exists('headers.key', true, { headers: {}}));
        });

        it('should return true if no key for object and exists is false', function () {
            assert.ok(predicates.exists('headers.key', false, { headers: {}}));
        });

        it('should return true for non empty object key if exists is true', function () {
            assert.ok(predicates.exists('headers.key', true, { headers: { key: 'nonempty' }}));
        });

        it('should return false for empty object key if exists is true', function () {
            assert.ok(!predicates.exists('headers.key', true, { headers: { key: '' }}));
        });

        it('should return false for non empty object key if exists is false', function () {
            assert.ok(!predicates.exists('headers.key', false, { headers: { key: 'nonempty' }}));
        });

        it('should return true for empty object key if exists is false', function () {
            assert.ok(predicates.exists('headers.key', false, { headers: { key: '' }}));
        });
    });

    describe('#not', function () {
        it('should return true for non empty request field if exists is true', function () {
            assert.ok(predicates.not('field', { is: 'this' }, { field: 'that' }));
        });

        it('should return false for empty request field if exists is true', function () {
            assert.ok(!predicates.not('field', { is: 'this' }, { field: 'this' }));
        });
    });

    describe('#or', function () {
        it('should return true if any sub-predicate is true', function () {
            assert.ok(predicates.or('field', [{ is: 'this' }, { is: 'that' }], { field: 'that' }));
        });

        it('should return false if no sub-predicate is true', function () {
            assert.ok(!predicates.or('field', [{ is: 'this' }, { is: 'that' }], { field: 'what' }));
        });
    });

    describe('#and', function () {
        it('should return true if all sub-predicate is true', function () {
            assert.ok(predicates.and('field', [{ is: 'this' }, { startsWith: 'th' }], { field: 'this' }));
        });

        it('should return false if any sub-predicate is false', function () {
            assert.ok(!predicates.and('field', [{ is: 'this' }, { is: 'that' }], { field: 'that' }));
        });
    });

    describe('#inject', function () {
        it('should return true if injected function returns true', function () {
            var fn = "function () { return true; }";
            assert.ok(predicates.inject('request', fn, {}));
        });

        it('should return false if injected function returns false', function () {
            var fn = "function () { return false; }";
            assert.ok(!predicates.inject('request', fn, {}));
        });

        it('should return true if injected function matches request', function () {
            var fn = "function (obj) { return obj.path === '/' && obj.method === 'GET'; }";
            assert.ok(predicates.inject('request', fn, { path: '/', method: 'GET' }));
        });

        it('should return true if injected function matches path', function () {
            var fn = "function (path) { return path === '/'; }";
            assert.ok(predicates.inject('path', fn, { path: '/' }));
        });
    });
});
