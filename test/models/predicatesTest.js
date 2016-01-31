'use strict';

var assert = require('assert'),
    predicates = require('../../src/models/predicates'),
    util = require('util');

describe('predicates', function () {
    describe('#equals', function () {
        it('should return false for mismatched strings', function () {
            var predicate = { equals: { field: 'value' } },
                request = { field: 'other' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should return true for matching strings', function () {
            var predicate = { equals: { field: 'value' } },
                request = { field: 'value' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should be case insensitive by default', function () {
            var predicate = { equals: { field: 'VALUE' } },
                request = { field: 'Value' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should allow case sensitivity', function () {
            var predicate = { equals: { field: 'VALUE' }, caseSensitive: true },
                request = { field: 'Value' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value' } };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: {} };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should return false if mismatched key for object', function () {
            var predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: { key: 'other' } };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            var predicate = { equals: { headers: { key: 'VALUE' } } },
                request = { headers: { key: 'Value' } };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should allow matching values in a case sensitive fashion for objects', function () {
            var predicate = { equals: { headers: { key: 'VALUE' } }, caseSensitive: true },
                request = { headers: { key: 'Value' } };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should match keys in a case insensitive fashion for object', function () {
            var predicate = { equals: { headers: { KEY: 'value' } } },
                request = { headers: { Key: 'value' } };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should allow matching keys in a case sensitive fashion for object', function () {
            var predicate = { equals: { headers: { KEY: 'value' } }, caseSensitive: true },
                request = { headers: { Key: 'value' } };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should match missing field with empty string', function () {
            var predicate = { equals: { field: '' } },
                request = {};
            assert.ok(predicates.equals(predicate, request));
        });

        it('should return true if equals binary sequence and encoding is base64', function () {
            var binary = new Buffer([1, 2, 3, 4]).toString('base64'),
                predicate = { equals: { field: binary } },
                request = { field: binary };
            assert.ok(predicates.equals(predicate, request, 'base64'));
        });

        it('should return false if is not binary sequence and encoding is base64', function () {
            var actual = new Buffer([1, 2, 3, 4]).toString('base64'),
                expected = new Buffer([1, 2, 4]).toString('base64'),
                predicate = { equals: { field: expected } },
                request = { field: actual };
            assert.ok(!predicates.equals(predicate, request, 'base64'));
        });

        it('should be true if all fields equal', function () {
            var predicate = { equals: { first: '1', second: '2' } },
                request = { first: '1', second: '2' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should be false if one field not equal', function () {
            var predicate = { equals: { first: '1', second: '2' } },
                request = { first: '1', second: '3' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should be true if all equal except pattern', function () {
            var predicate = { equals: { field: 'This is a test' }, except: '\\d+' },
                request = { field: '1This is 3a 2test' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should obey be case-insensitive except match by default', function () {
            var predicate = { equals: { field: 'is is a test' }, except: '^tH' },
                request = { field: 'This is a test' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should be case-sensitive except match if configured', function () {
            var predicate = { equals: { field: 'his is a test' }, except: '^t', caseSensitive: true },
                request = { field: 'This is a test' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('should return true if any value in a multi-value key is equal', function () {
            var predicate = { equals: { query: { key: '234' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should return false if no value in a multi-value key is equal', function () {
            var predicate = { equals: { query: { key: '23' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(!predicates.equals(predicate, request));
        });
    });

    describe('#deepEquals', function () {
        it('should return false for mismatched strings', function () {
            var predicate = { deepEquals: { field: 'value' } },
                request = { field: 'other' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should return true for matching strings', function () {
            var predicate = { deepEquals: { field: 'value' } },
                request = { field: 'value' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be case insensitive by default', function () {
            var predicate = { deepEquals: { field: 'VALUE' } },
                request = { field: 'Value' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should allow case sensitivity', function () {
            var predicate = { deepEquals: { field: 'VALUE' }, caseSensitive: true },
                request = { field: 'Value' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should be true if empty object matches empty request field', function () {
            var predicate = { deepEquals: { query: {} } },
                request = { query: {} };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be false if empty object provided but request field not empty', function () {
            var predicate = { deepEquals: { query: {} } },
                request = { query: { q: 'test' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should match exact key-value pairs for objects', function () {
            var predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value' } };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should not match if extra key exists in request field', function () {
            var predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value', other: 'other' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should match ignoring unspecified request fields', function () {
            var predicate = { deepEquals: { query: { key: 'value' } } },
                request = { query: { key: 'value' }, field: 'true' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: {} };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should return false if mismatched key for object', function () {
            var predicate = { deepEquals: { headers: { key: 'value' } } },
                request = { headers: { key: 'other' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            var predicate = { deepEquals: { headers: { key: 'VALUE' } } },
                request = { headers: { key: 'Value' } };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should allow matching values in a case sensitive fashion for objects', function () {
            var predicate = { deepEquals: { headers: { key: 'VALUE' } }, caseSensitive: true },
                request = { headers: { key: 'Value' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should match keys in a case insensitive fashion for object', function () {
            var predicate = { deepEquals: { headers: { KEY: 'value' } } },
                request = { headers: { Key: 'value' } };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should allow matching keys in a case sensitive fashion for object', function () {
            var predicate = { deepEquals: { headers: { KEY: 'value' } }, caseSensitive: true },
                request = { headers: { Key: 'value' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should be false if request has extra field', function () {
            var predicate = { deepEquals: { headers: { key: 'value' } }, caseSensitive: true },
                request = { headers: { key: 'value', other: 'next' } };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should not match missing field with empty string', function () {
            var predicate = { deepEquals: { field: '' } },
                request = {};
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should return true if equals binary sequence and encoding is base64', function () {
            var binary = new Buffer([1, 2, 3, 4]).toString('base64'),
                predicate = { deepEquals: { field: binary } },
                request = { field: binary };
            assert.ok(predicates.deepEquals(predicate, request, 'base64'));
        });

        it('should return false if is not binary sequence and encoding is base64', function () {
            var actual = new Buffer([1, 2, 3, 4]).toString('base64'),
                expected = new Buffer([1, 2, 4]).toString('base64'),
                predicate = { deepEquals: { field: expected } },
                request = { field: actual };
            assert.ok(!predicates.deepEquals(predicate, request, 'base64'));
        });

        it('should be true if all fields equal', function () {
            var predicate = { deepEquals: { first: '1', second: '2' } },
                request = { first: '1', second: '2' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be false if one field not equal', function () {
            var predicate = { deepEquals: { first: '1', second: '2' } },
                request = { first: '1', second: '3' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should be true if all equal except pattern', function () {
            var predicate = { deepEquals: { field: 'This is a test' }, except: '\\d+' },
                request = { field: '1This is 3a 2test' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be true for ints, bools, and floats when actual is strings', function () {
            var predicate = { deepEquals: { query: { int: 1, float: 1.1, bool: true } } },
                request = { query: { int: '1', float: '1.1', bool: 'true' } };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be true if all values in a multi-value key are present', function () {
            var predicate = { deepEquals: { query: { key: ['first', 'second'] } } },
                request = { query: { key: ['first', 'second'] }, field: 'true' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('should be false if some values in a multi-value key are missing', function () {
            var predicate = { deepEquals: { query: { key: ['first', 'second', 'third'] } } },
                request = { query: { key: ['first', 'second'] }, field: 'true' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('should be true if values in a multi-value key are out of order', function () {
            // In cases where this comes up - querystrings and xpath selectors,
            // order is irrelevant
            var predicate = { deepEquals: { query: { key: ['first', 'second'] } } },
                request = { query: { key: ['second', 'first'] }, field: 'true' };
            assert.ok(predicates.deepEquals(predicate, request));
        });
    });

    describe('#contains', function () {
        it('should return false for request field not containing expected', function () {
            var predicate = { contains: { field: 'middle' } },
                request = { field: 'begin end' };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('should return true for request field containing expected', function () {
            var predicate = { contains: { field: 'middle' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should be case insensitive by default', function () {
            var predicate = { contains: { field: 'MIDDLE' } },
                request = { field: 'begin Middle end' };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should allow case sensitivity', function () {
            var predicate = { contains: { field: 'MIDDLE' }, caseSensitive: true },
                request = { field: 'begin Middle end' };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: { key: 'begin middle end' } };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: {} };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('should return false if key for object does not contain string', function () {
            var predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: { key: 'begin end' } };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            var predicate = { contains: { headers: { key: 'Middle' } } },
                request = { headers: { key: 'begin MIDDLE end' } };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should allow case sensitivity when matching values for objects', function () {
            var predicate = { contains: { headers: { key: 'Middle' } }, caseSensitive: true },
                request = { headers: { key: 'begin MIDDLE end' } };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('should return true if contains binary sequence and encoding is base64', function () {
            var predicate = { contains: { field: new Buffer([2, 3]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.contains(predicate, request, 'base64'));
        });

        it('should return false if not contains binary sequence and encoding is base64', function () {
            var predicate = { contains: { field: new Buffer([2, 4]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.contains(predicate, request, 'base64'));
        });

        it('should return true if repeating query key contains value', function () {
            var predicate = { contains: { query: { key: '123' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should return true if repeating query key contains value with the right substring', function () {
            var predicate = { contains: { query: { key: 'mid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.contains(predicate, request));
        });

        it('should return false if repeating query key does not contain value', function () {
            var predicate = { contains: { query: { key: 'bid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.contains(predicate, request));
        });
    });

    describe('#startsWith', function () {
        it('should return false for request field not starting with expected', function () {
            var predicate = { startsWith: { field: 'middle' } },
                request = { field: 'begin middle end' };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('should return true for request field starting with expected', function () {
            var predicate = { startsWith: { field: 'begin' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('should be case insensitive by defaul', function () {
            var predicate = { startsWith: { field: 'BEGIN' } },
                request = { field: 'Begin middle end' };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('should allow case insensitive', function () {
            var predicate = { startsWith: { field: 'BEGIN' }, caseSensitive: true },
                request = { field: 'Begin middle end' };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: { key: 'begin middle end' } };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: {} };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('should return false if key for object does not start with string', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: { key: 'middle end' } };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('should return true if starts with binary sequence and encoding is base64', function () {
            var predicate = { startsWith: { field: new Buffer([1, 2]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.startsWith(predicate, request, 'base64'));
        });

        it('should return false if does not start with binary sequence and encoding is base64', function () {
            var predicate = { startsWith: { field: new Buffer([2]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.startsWith(predicate, request, 'base64'));
        });

        it('should return true if repeating query key has value starting with string', function () {
            var predicate = { startsWith: { query: { key: 'mid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('should return false if repeating query key does not have value starting with string', function () {
            var predicate = { startsWith: { query: { key: 'egin' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.startsWith(predicate, request));
        });
    });

    describe('#endsWith', function () {
        it('should return false for request field not ending with expected', function () {
            var predicate = { endsWith: { field: 'middle' } },
                request = { field: 'begin middle end' };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('should return true for request field starting with expected', function () {
            var predicate = { endsWith: { field: 'end' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('should be case insensitive by default', function () {
            var predicate = { endsWith: { field: 'END' } },
                request = { field: 'begin middle End' };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('should be allow for case isensitivity', function () {
            var predicate = { endsWith: { field: 'END' }, caseSensitive: true },
                request = { field: 'begin middle End' };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { endsWith: { headers: { field: 'end' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { endsWith: { headers: { field: 'end' } } },
                request = { headers: {} };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('should return false if key for object does not ending with string', function () {
            var predicate = { endsWith: { headers: { field: 'begin' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('should return true if ends with binary sequence and encoding is base64', function () {
            var predicate = { endsWith: { field: new Buffer([2, 3, 4]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.endsWith(predicate, request, 'base64'));
        });

        it('should return false if does not end with binary sequence and encoding is base64', function () {
            var predicate = { endsWith: { field: new Buffer([1, 2, 3]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.endsWith(predicate, request, 'base64'));
        });

        it('should return true if repeating query key has value ending with string', function () {
            var predicate = { endsWith: { query: { key: 'gin' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('should return false if repeating query key does not have value ending with string', function () {
            var predicate = { endsWith: { query: { key: 'begi' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.endsWith(predicate, request));
        });
    });

    describe('#matches', function () {
        it('should return false for request field not matching expected', function () {
            var predicate = { matches: { field: 'middle$' } },
                request = { field: 'begin middle end' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('should return true for request field matching expected', function () {
            var predicate = { matches: { field: 'end$' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.matches(predicate, request));
        });

        it('should be case-insensitive by default', function () {
            var predicate = { matches: { field: 'END$' } },
                request = { field: 'begin middle End' };
            assert.ok(predicates.matches(predicate, request));
        });

        it('should allow case sensitivity', function () {
            var predicate = { matches: { field: 'END$' }, caseSensitive: true },
                request = { field: 'begin middle End' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('should not provide case-insensitivity by transforming regex', function () {
            var predicate = { matches: { field: '\\d\\D\\d' } },
                request = { field: '1a2' };
            assert.ok(predicates.matches(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { matches: { headers: { field: 'end$' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(predicates.matches(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { matches: { headers: { field: 'end$' } } },
                request = { headers: {} };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('should return false if key for object does not matches string', function () {
            var predicate = { matches: { headers: { field: 'begin\\d+' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('should throw an error if encoding is base64', function () {
            try {
                var predicate = { matches: { field: 'dGVzdA==' } },
                    request = { field: 'dGVzdA==' };
                predicates.matches(predicate, request, 'base64');
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'the matches predicate is not allowed in binary mode');
            }
        });

        it('should return true if repeating query key has value matching string', function () {
            var predicate = { matches: { query: { key: 'iddle$' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.matches(predicate, request));
        });

        it('should return false if repeating query key does not have value matching string', function () {
            var predicate = { matches: { query: { key: '^iddle' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.matches(predicate, request));
        });
    });

    describe('#exists', function () {
        it('should return true for non empty request field if exists is true', function () {
            var predicate = { exists: { field: true } },
                request = { field: 'nonempty' };
            assert.ok(predicates.exists(predicate, request));
        });

        it('should return false for empty request field if exists is true', function () {
            var predicate = { exists: { field: true } },
                request = { field: '' };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should return false for non empty request field if exists is false', function () {
            var predicate = { exists: { field: false } },
                request = { field: 'nonempty' };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should return true for empty request field if exists is false', function () {
            var predicate = { exists: { field: false } },
                request = { field: '' };
            assert.ok(predicates.exists(predicate, request));
        });

        it('should return false if no key for object and exists is true', function () {
            var predicate = { exists: { headers: { field: true } } },
                request = { headers: {} };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should return true if no key for object and exists is false', function () {
            var predicate = { exists: { headers: { field: false } } },
                request = { headers: {} };
            assert.ok(predicates.exists(predicate, request));
        });

        it('should return true for non empty object key if exists is true', function () {
            var predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(predicates.exists(predicate, request));
        });

        it('should return false for empty object key if exists is true', function () {
            var predicate = { exists: { headers: { key: true } } },
                request = { headers: { key: '' } };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should return false for non empty object key if exists is false', function () {
            var predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: 'nonempty' } };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should return true for empty object key if exists is false', function () {
            var predicate = { exists: { headers: { key: false } } },
                request = { headers: { key: '' } };
            assert.ok(predicates.exists(predicate, request));
        });
    });

    describe('#not', function () {
        it('should return true for non empty request field if exists is true', function () {
            var predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'that' };
            assert.ok(predicates.not(predicate, request));
        });

        it('should return false for empty request field if exists is true', function () {
            var predicate = { not: { equals: { field: 'this' } } },
                request = { field: 'this' };
            assert.ok(!predicates.not(predicate, request));
        });

        it('should throw exception if invalid sub-predicate', function () {
            try {
                var predicate = { not: { invalid: { field: 'this' } } },
                    request = { field: 'this' };
                predicates.not(predicate, request);
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'missing predicate: ["invalid"]');
            }
        });
    });

    describe('#or', function () {
        it('should return true if any sub-predicate is true', function () {
            var predicate = { or: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'this' };
            assert.ok(predicates.or(predicate, request));
        });

        it('should return false if no sub-predicate is true', function () {
            var predicate = { or: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'what' };
            assert.ok(!predicates.or(predicate, request));
        });
    });

    describe('#and', function () {
        it('should return true if all sub-predicate is true', function () {
            var predicate = { and: [{ equals: { field: 'this' } }, { startsWith: { field: 'th' } }] },
                request = { field: 'this' };
            assert.ok(predicates.and(predicate, request));
        });

        it('should return false if any sub-predicate is false', function () {
            var predicate = { and: [{ equals: { field: 'this' } }, { equals: { field: 'that' } }] },
                request = { field: 'this' };
            assert.ok(!predicates.and(predicate, request));
        });
    });

    describe('#inject', function () {
        it('should return true if injected function returns true', function () {
            var predicate = { inject: 'function () { return true; }' },
                request = {};
            assert.ok(predicates.inject(predicate, request));
        });

        it('should return false if injected function returns false', function () {
            var predicate = { inject: 'function () { return false; }' },
                request = {};
            assert.ok(!predicates.inject(predicate, request));
        });

        it('should return true if injected function matches request', function () {
            var fn = function (obj) { return obj.path === '/' && obj.method === 'GET'; },
                predicate = { inject: fn.toString() },
                request = { path: '/', method: 'GET' };
            assert.ok(predicates.inject(predicate, request));
        });

        it('should log injection exceptions', function () {
            var errorsLogged = [],
                logger = {
                    error: function () {
                        var message = util.format.apply(this, Array.prototype.slice.call(arguments));
                        errorsLogged.push(message);
                    }
                },
                predicate = { inject: 'function () { throw Error("BOOM!!!"); }' },
                request = {};

            try {
                predicates.inject(predicate, request, 'utf8', logger);
                assert.fail('should have thrown exception');
            }
            catch (error) {
                assert.strictEqual(error.message, 'invalid predicate injection');
                assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
            }
        });

        it('should not run injection during dry run validation', function () {
            var fn = function () { throw new Error('BOOM!'); },
                predicate = { inject: fn.toString() },
                request = { isDryRun: true };
            assert.ok(predicates.inject(predicate, request));
        });
    });

    describe('#resolve', function () {
        it('should call equals if present in predicate', function () {
            var predicate = { equals: { field: 'value' } },
                request = { field: 'other' };
            assert.ok(!predicates.resolve(predicate, request));
        });

        it('should call deepEquals if present in predicate', function () {
            var predicate = { deepEquals: { query: {} } },
                request = { query: {} };
            assert.ok(predicates.resolve(predicate, request));
        });
    });

    describe('xpath', function () {
        it('#equals should be false if field is not XML', function () {
            var predicate = {
                    equals: { field: 'VALUE' },
                    xpath: { selector: '//title' }
                },
                request = { field: 'VALUE' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should be true if value in provided xpath expression', function () {
            var predicate = {
                    equals: { field: 'VALUE' },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>value</title></doc>' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should be false if value provided xpath expression does not equal', function () {
            var predicate = {
                    equals: { field: 'NOT VALUE' },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>value</title></doc>' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should use case-insensitive xpath selector by default', function () {
            var predicate = {
                    equals: { field: 'VALUE' },
                    xpath: { selector: '//Title' }
                },
                request = { field: '<DOC><TITLE>value</TITLE></DOC>' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should not equal if case-sensitive xpath selector does not match', function () {
            var predicate = {
                    equals: { field: 'value' },
                    xpath: { selector: '//Title' },
                    caseSensitive: true
                },
                request = { field: '<DOC><TITLE>value</TITLE></DOC>' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should equal if case-sensitive xpath selector matches', function () {
            var predicate = {
                    equals: { field: 'value' },
                    xpath: { selector: '//Title' },
                    caseSensitive: true
                },
                request = { field: '<Doc><Title>value</Title></Doc>' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should equal if case-sensitive xpath selector matches, stripping out the exception', function () {
            var predicate = {
                    equals: { field: 've' },
                    xpath: { selector: '//Title' },
                    caseSensitive: true,
                    except: 'alu'
                },
                request = { field: '<Doc><Title>value</Title></Doc>' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should not equal if case-sensitive xpath selector matches, but stripped values differ', function () {
            var predicate = {
                    equals: { field: 'v' },
                    xpath: { selector: '//Title' },
                    caseSensitive: true,
                    except: 'alu'
                },
                request = { field: '<Doc><Title>value</Title></Doc>' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#deepEquals should be false if field is not XML and xpath selector used', function () {
            var predicate = {
                    deepEquals: { field: 'VALUE' },
                    xpath: { selector: '//title' }
                },
                request = { field: 'VALUE' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should equal value in provided xpath attribute', function () {
            var predicate = {
                    deepEquals: { field: 'VALUE' },
                    xpath: { selector: '//title/@href' }
                },
                request = { field: '<doc><title href="value">text</title></doc>' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be false if value in provided xpath attribute expression does not equal', function () {
            var predicate = {
                    deepEquals: { field: 'NOT VALUE' },
                    xpath: { selector: '//title/@attr' }
                },
                request = { field: '<doc><title attr="value">text</title></doc>' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be true if all values in a multi-value selector match are present', function () {
            var predicate = {
                    deepEquals: { field: ['first', 'second'] },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>first</title><title>second</title></doc>' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be false if some values in a multi-value selector match are missing', function () {
            var predicate = {
                    deepEquals: { field: ['first', 'second'] },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>first</title><title>second</title><title>third</title></doc>' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be true if values in a multi-value selector match are out of order', function () {
            var predicate = {
                    deepEquals: { field: ['first', 'second'] },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>second</title><title>first</title></doc>' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#contains should be true if direct text value contains predicate', function () {
            var predicate = {
                    contains: { field: 'value' },
                    xpath: { selector: '//title/text()' }
                },
                request = { field: '<doc><title>this is a value</title>' };
            assert.ok(predicates.contains(predicate, request));
        });

        it('#contains should be false if direct text value does not contain predicate', function () {
            var predicate = {
                    contains: { field: 'VALUE' },
                    xpath: { selector: '//title/text()' },
                    caseSensitive: true },
                request = { field: '<doc><title>this is a value</title>' };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('#startsWith should be true if direct namespaced xpath selection starts with value', function () {
            var predicate = {
                    startsWith: { field: 'Harry' },
                    xpath: { selector: '//*[local-name(.)="title" and namespace-uri(.)="myns"]' }
                },
                request = { field: '<book><title xmlns="myns">Harry Potter</title></book>' };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('#startsWith should be false if direct namespaced xpath selection does not start with value', function () {
            var predicate = {
                    startsWith: { field: 'Potter' },
                    xpath: { selector: '//*[local-name(.)="title" and namespace-uri(.)="myns"]' }
                },
                request = { field: '<book><title xmlns="myns">Harry Potter</title></book>' };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('#startsWith should be false if direct namespaced xpath selection does not match', function () {
            var predicate = {
                    startsWith: { field: 'Harry' },
                    xpath: { selector: '//*[local-name(.)="title" and namespace-uri(.)="myns"]' }
                },
                request = { field: '<book><title>Harry Potter</title></book>' };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('#endsWith should be true if aliased namespace match endsWith predicate', function () {
            var predicate = {
                    endsWith: { field: 'Potter' },
                    xpath: {
                        selector: '//bookml:title/text()',
                        ns: {
                            bookml: 'http://example.com/book'
                        }
                    }
                },
                request = { field: '<book xmlns:bookml="http://example.com/book"><bookml:title>Harry Potter</bookml:title></book>' };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('#endsWith should be false if aliased namespace match does not end with predicate', function () {
            var predicate = {
                    endsWith: { field: 'Harry' },
                    xpath: {
                        selector: '//bookml:title/text()',
                        ns: {
                            bookml: 'http://example.com/book'
                        }
                    }
                },
                request = { field: '<book xmlns:bookml="http://example.com/book"><bookml:title>Harry Potter</bookml:title></book>' };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('#equals should be true if any matched node equals the predicate value', function () {
            var predicate = {
                    equals: { field: 'Second' },
                    xpath: {
                        selector: '//a:child',
                        ns: {
                            a: 'http://example.com/a',
                            b: 'http://example.com/b'
                        }
                    }
                },
                request = {
                    field: '<root xmlns:thisa="http://example.com/a" xmlns:thisb="http://example.com/b">' +
                           '  <thisa:child>First</thisa:child>' +
                           '  <thisa:child>Second</thisa:child>' +
                           '  <thisa:child>Third</thisa:child>' +
                           '</root>'
                };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should be false if no nodes match the selector', function () {
            // despite namespace aliases matching, urls do not
            var predicate = {
                    equals: { field: 'Second' },
                    xpath: {
                        selector: '//a:child',
                        ns: {
                            a: 'http://example.com/a',
                            b: 'http://example.com/b'
                        }
                    }
                },
                request = {
                    field: '<root xmlns:b="http://example.com/a" xmlns:a="http://example.com/b">' +
                    '  <a:child>First</a:child>' +
                    '  <a:child>Second</a:child>' +
                    '  <a:child>Third</a:child>' +
                    '</root>'
                };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#matches should be false if field is not XML', function () {
            var predicate = {
                    matches: { field: 'VALUE' },
                    xpath: { selector: '//title' }
                },
                request = { field: 'VALUE' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('#matches should be true if selected value matches regex', function () {
            var predicate = {
                    matches: { field: '^v' },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>value</title></doc>' };
            assert.ok(predicates.matches(predicate, request));
        });

        it('#matches should be false if selected value does not match regex', function () {
            var predicate = {
                    matches: { field: 'v$' },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>value</title></doc>' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('should throw an error if encoding is base64', function () {
            try {
                var predicate = {
                        equals: { field: 'dGVzdA==' },
                        xpath: { selector: 'dGVzdA==' }
                    },
                    request = { field: 'dGVzdA==' };
                predicates.equals(predicate, request, 'base64');
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'the xpath predicate parameter is not allowed in binary mode');
            }
        });

        it('#exists should be true if xpath selector has at least one result', function () {
            var predicate = {
                    exists: { field: true },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><title>value</title></doc>' };
            assert.ok(predicates.exists(predicate, request));
        });

        it('#exists should be false if xpath selector does not match', function () {
            var predicate = {
                    exists: { field: true },
                    xpath: { selector: '//title' }
                },
                request = { field: '<doc><summary>value</summary></doc>' };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('should throw error if xpath selector is malformed', function () {
            try {
                var predicate = {
                        equals: { field: 'value' },
                        xpath: { selector: '=*INVALID*=' }
                    },
                    request = { field: '<doc><title>value</title></doc>' };
                predicates.equals(predicate, request);
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'malformed xpath predicate selector');
            }
        });

        it('should accept numbers using count()', function () {
            var predicate = {
                    equals: { field: 2 },
                    xpath: { selector: 'count(//title)' }
                },
                request = { field: '<doc><title>first</title><title>second</title></doc>' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should accept booleans returning false', function () {
            var predicate = {
                    equals: { field: false },
                    xpath: { selector: 'boolean(//title)' }
                },
                request = { field: '<doc></doc>' };
            assert.ok(predicates.equals(predicate, request));
        });
    });

    describe('treating strings as json', function () {
        it('#equals should be false if field is not XML', function () {
            var predicate = { equals: { field: { key: 'VALUE' } } },
                request = { field: 'KEY: VALUE' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should be true if JSON string value equals JSON predicate', function () {
            var predicate = { equals: { field: { key: 'VALUE' } } },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should be false if JSON string value does not equal JSON predicate', function () {
            var predicate = { equals: { field: { key: 'VALUE' } } },
                request = { field: 'Not value' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should be true if JSON string value equals JSON predicate except for case', function () {
            var predicate = { equals: { field: { KEY: 'value' } } },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should not be true if JSON string value case different and caseSensitive is true', function () {
            var predicate = {
                    equals: { field: { KEY: 'value' } },
                    caseSensitive: true
                },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#equals should equal if case-sensitive predicate matches, stripping out the exception', function () {
            var predicate = {
                    equals: { field: { key: 'VE' } },
                    caseSensitive: true,
                    except: 'ALU'
                },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should not equal if case-sensitive predicate matches, but stripped values differ', function () {
            var predicate = {
                    equals: { field: { key: 'V' } },
                    caseSensitive: true,
                    except: 'ALU'
                },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#deepEquals should be false if field is not JSON and JSON predicate used', function () {
            var predicate = { deepEquals: { field: { key: 'VALUE' } } },
                request = { field: '"key": "VALUE"' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should equal value in provided JSON attribute', function () {
            var predicate = { deepEquals: { field: { key: 'VALUE' } } },
                request = { field: '{"key": "VALUE"}' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be false if value in provided JSON predicate does not equal', function () {
            var predicate = { deepEquals: { field: { key: 'test' } } },
                request = { field: '{"key": "VALUE"}' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be true if all values in a JSON predicate match are present', function () {
            var predicate = {
                    deepEquals: {
                        field: {
                            key: 'value',
                            outer: { inner: 'value' }
                        }
                    }
                },
                request = { field: '{"key": "VALUE", "outer": { "inner": "value" }}' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be false if some values in a multi-value JSON predicate match are missing', function () {
            var predicate = {
                    deepEquals: {
                        field: {
                            key: 'value',
                            outer: { inner: 'value' }
                        }
                    }
                },
                request = { field: '{"outer": { "inner": "value" }}' };
            assert.ok(!predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be true if all array values in a JSON predicate match are present regardless of order', function () {
            var predicate = { deepEquals: { field: { key: [2, 1, 3] } } },
                request = { field: '{"key": [3, 1, 2]}' };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#contains should be true if JSON value contains predicate', function () {
            var predicate = { contains: { field: { key: 'alu' } } },
                request = { field: '{ "key": "VALUE" }' };
            assert.ok(predicates.contains(predicate, request));
        });

        it('#contains should be false if JSON value does not contain predicate', function () {
            var predicate = {
                    contains: { field: { key: 'VALUE' } },
                    caseSensitive: true
                },
                request = { field: '{"key": "test"}' };
            assert.ok(!predicates.contains(predicate, request));
        });

        it('#startsWith should be true if JSON field starts with value', function () {
            var predicate = { startsWith: { field: { key: 'Harry' } } },
                request = { field: '{"key": "Harry Potter"}' };
            assert.ok(predicates.startsWith(predicate, request));
        });

        it('#startsWith should be false if JSON field does not start with value', function () {
            var predicate = { startsWith: { field: { key: 'Potter' } } },
                request = { field: '{"key":"Harry Potter"}' };
            assert.ok(!predicates.startsWith(predicate, request));
        });

        it('#endsWith should be true if JSON field ends with predicate', function () {
            var predicate = { endsWith: { field: { key: 'Potter' } } },
                request = { field: '{"key": "Harry Potter"}' };
            assert.ok(predicates.endsWith(predicate, request));
        });

        it('#endsWith should be false if JSON field does not end with predicate', function () {
            var predicate = { endsWith: { field: { key: 'Harry' } } },
                request = { field: '{"key": "Harry Potter"}' };
            assert.ok(!predicates.endsWith(predicate, request));
        });

        it('#equals should be true if any array element equals the predicate value', function () {
            var predicate = { equals: { field: { key: 'Second' } } },
                request = { field: '{"key": ["First", "Second", "Third"]}' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should be false if no array elements match the predicate value', function () {
            // despite namespace aliases matching, urls do not
            var predicate = { equals: { field: { key: 'Second' } } },
                request = { field: '{"key": ["first", "third"]}' };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#matches should be false if field is not JSON', function () {
            var predicate = { matches: { field: { key: 'VALUE' } } },
                request = { field: '"key": "value"' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('#matches should be true if selected JSON value matches regex', function () {
            var predicate = { matches: { field: { key: '^v' } } },
                request = { field: '{"key": "Value"}' };
            assert.ok(predicates.matches(predicate, request));
        });

        it('#matches should be false if selected JSON value does not match regex', function () {
            var predicate = { matches: { field: { key: 'v$' } } },
                request = { field: '{"key":"value"}' };
            assert.ok(!predicates.matches(predicate, request));
        });

        it('#exists should be true if JSON key exists', function () {
            var predicate = { exists: { field: { key: true } } },
                request = { field: '{"key":"exists"}' };
            assert.ok(predicates.exists(predicate, request));
        });

        it('#exists should be false if JSON key does not exist', function () {
            var predicate = { exists: { field: { key: true } } },
                request = { field: '{}' };
            assert.ok(!predicates.exists(predicate, request));
        });

        it('#equals should be true if matches key for any object in array', function () {
            var predicate = { equals: { examples: { key: 'third' } } },
                request = { examples: [{ key: 'first' }, { different: true }, { key: 'third' }] };
            assert.ok(predicates.equals(predicate, request));
        });

        it('#equals should be false if all keys in an array do not match', function () {
            var predicate = { equals: { examples: { key: true } } },
                request = { examples: [{ key: 'first' }, { different: true }, { key: 'third' }] };
            assert.ok(!predicates.equals(predicate, request));
        });

        it('#deepEquals should be true if all objects in an array have fields equaling predicate', function () {
            var predicate = { deepEquals: { examples: [{ key: 'first' }, { key: 'second' }] } },
                request = { examples: [{ key: 'first' }, { key: 'second' }] };
            assert.ok(predicates.deepEquals(predicate, request));
        });

        it('#deepEquals should be false if missing an object in an array in request', function () {
            var predicate = { deepEquals: { examples: [{ key: 'first' }, { key: 'second' }] } },
                request = { examples: [{ key: 'first' }, { different: true }, { key: 'second' }] };
            assert.ok(!predicates.deepEquals(predicate, request));
        });
    });
});
