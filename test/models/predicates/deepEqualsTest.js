'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#deepEquals', function () {
        it('should return false for mismatched strings', function () {
            const predicate = { deepEquals: { field: 'value' } },
                request = { field: 'other' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for matching strings', function () {
            const predicate = { deepEquals: { field: 'value' } },
                request = { field: 'value' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case insensitive by default', function () {
            const predicate = { deepEquals: { field: 'VALUE' } },
                request = { field: 'Value' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case sensitivity', function () {
            const predicate = { deepEquals: { field: 'VALUE' }, caseSensitive: true },
                request = { field: 'Value' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be true if empty object matches empty request field', function () {
            const predicate = { deepEquals: { query: {} } },
                request = { query: {} };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be false if empty object provided but request field not empty', function () {
            const predicate = { deepEquals: { query: {} } },
                request = { query: { q: 'test' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match exact key-value pairs for objects', function () {
            const predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should not match if extra key exists in request field', function () {
            const predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value', other: 'other' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match ignoring unspecified request fields', function () {
            const predicate = { deepEquals: { query: { key: 'value' } } },
                request = { query: { key: 'value' }, field: 'true' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object', function () {
            const predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false if mismatched key for object', function () {
            const predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'other' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            const predicate = { deepEquals: { headers: { key: 'VALUE' } } },
                request = { headers: { key: 'Value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow matching values in a case sensitive fashion for objects', function () {
            const predicate = { deepEquals: { headers: { key: 'VALUE' } }, caseSensitive: true },
                request = { headers: { key: 'Value' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match keys in a case insensitive fashion for object', function () {
            const predicate = { deepEquals: { headers: { KEY: 'value' } } },
                request = { headers: { Key: 'value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow matching keys in a case sensitive fashion for object', function () {
            const predicate = { deepEquals: { headers: { KEY: 'value' } }, caseSensitive: true },
                request = { headers: { Key: 'value' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be false if request has extra field', function () {
            const predicate = { deepEquals: { headers: { key: 'value' } }, caseSensitive: true },
                request = { headers: { key: 'value', other: 'next' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should not match missing field with empty string', function () {
            const predicate = { deepEquals: { field: '' } },
                request = {};
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if equals binary sequence and encoding is base64', function () {
            const binary = new Buffer([1, 2, 3, 4]).toString('base64'),
                predicate = { deepEquals: { field: binary } },
                request = { field: binary };
            assert.ok(predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return false if is not binary sequence and encoding is base64', function () {
            const actual = new Buffer([1, 2, 3, 4]).toString('base64'),
                expected = new Buffer([1, 2, 4]).toString('base64'),
                predicate = { deepEquals: { field: expected } },
                request = { field: actual };
            assert.ok(!predicates.evaluate(predicate, request, 'base64'));
        });

        it('should be true if all fields equal', function () {
            const predicate = { deepEquals: { first: '1', second: '2' } },
                request = { first: '1', second: '2' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be false if one field not equal', function () {
            const predicate = { deepEquals: { first: '1', second: '2' } },
                request = { first: '1', second: '3' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be true if all equal except pattern', function () {
            const predicate = { deepEquals: { field: 'This is a test' }, except: '\\d+' },
                request = { field: '1This is 3a 2test' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be true for ints, bools, and floats when actual is strings', function () {
            const predicate = { deepEquals: { query: { int: 1, float: 1.1, bool: true } } },
                request = { query: { int: '1', float: '1.1', bool: 'true' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be true if all values in a multi-value key are present', function () {
            const predicate = { deepEquals: { query: { key: ['first', 'second'] } } },
                request = { query: { key: ['first', 'second'] }, field: 'true' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be false if some values in a multi-value key are missing', function () {
            const predicate = { deepEquals: { query: { key: ['first', 'second', 'third'] } } },
                request = { query: { key: ['first', 'second'] }, field: 'true' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be true if values in a multi-value key are out of order', function () {
            // In cases where this comes up - querystrings and xpath selectors,
            // order is irrelevant
            const predicate = { deepEquals: { query: { key: ['first', 'second'] } } },
                request = { query: { key: ['second', 'first'] }, field: 'true' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be true if equal with null object value', function () {
            const predicate = { deepEquals: { field: null } },
                request = { field: null };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
