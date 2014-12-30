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
            var predicate = { equals: { field: 'his is a test' }, except: '^t' },
                request = { field: 'this is a test' };
            assert.ok(predicates.equals(predicate, request));
        });

        it('should be case-sensitive except match if configured', function () {
            var predicate = { equals: { field: 'his is a test' }, except: '^t', caseSensitive: true },
                request = { field: 'This is a test' };
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
            var predicate = { contains: { query: { key: '123' } }},
                request = { query: { key: ['123', '234'] } };
            assert.ok(predicates.contains(predicate, request));
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
            var predicate = { endsWith: {  field: new Buffer([2, 3, 4]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.endsWith(predicate, request, 'base64'));
        });

        it('should return false if does not end with binary sequence and encoding is base64', function () {
            var predicate = { endsWith: {  field: new Buffer([1, 2, 3]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.endsWith(predicate, request, 'base64'));
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
            var predicate = { inject: "function (obj) { return obj.path === '/' && obj.method === 'GET'; }" },
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
});
