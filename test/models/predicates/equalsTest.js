'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#equals', function () {
        it('should return false for mismatched strings', function () {
            const predicate = { equals: { field: 'value' } },
                request = { field: 'other' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for matching strings', function () {
            const predicate = { equals: { field: 'value' } },
                request = { field: 'value' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case insensitive by default', function () {
            const predicate = { equals: { field: 'VALUE' } },
                request = { field: 'Value' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case sensitivity', function () {
            const predicate = { equals: { field: 'VALUE' }, caseSensitive: true },
                request = { field: 'Value' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            const predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: { key: 'value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object', function () {
            const predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false if mismatched key for object', function () {
            const predicate = { equals: { headers: { key: 'value' } } },
                request = { headers: { key: 'other' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', function () {
            const predicate = { equals: { headers: { key: 'VALUE' } } },
                request = { headers: { key: 'Value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow matching values in a case sensitive fashion for objects', function () {
            const predicate = { equals: { headers: { key: 'VALUE' } }, caseSensitive: true },
                request = { headers: { key: 'Value' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match keys in a case insensitive fashion for object', function () {
            const predicate = { equals: { headers: { KEY: 'value' } } },
                request = { headers: { Key: 'value' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow matching keys in a case sensitive fashion for object', function () {
            const predicate = { equals: { headers: { KEY: 'value' } }, caseSensitive: true },
                request = { headers: { Key: 'value' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match missing field with empty string', function () {
            const predicate = { equals: { field: '' } },
                request = {};
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true if equals binary sequence and encoding is base64', function () {
            const binary = Buffer.from([1, 2, 3, 4]).toString('base64'),
                predicate = { equals: { field: binary } },
                request = { field: binary };
            assert.ok(predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return false if is not binary sequence and encoding is base64', function () {
            const actual = Buffer.from([1, 2, 3, 4]).toString('base64'),
                expected = Buffer.from([1, 2, 4]).toString('base64'),
                predicate = { equals: { field: expected } },
                request = { field: actual };
            assert.ok(!predicates.evaluate(predicate, request, 'base64'));
        });

        it('should be true if all fields equal', function () {
            const predicate = { equals: { first: '1', second: '2' } },
                request = { first: '1', second: '2' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be false if one field not equal', function () {
            const predicate = { equals: { first: '1', second: '2' } },
                request = { first: '1', second: '3' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be true if all equal except pattern', function () {
            const predicate = { equals: { field: 'This is a test' }, except: '\\d+' },
                request = { field: '1This is 3a 2test' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should obey be case-insensitive except match by default', function () {
            const predicate = { equals: { field: 'is is a test' }, except: '^tH' },
                request = { field: 'This is a test' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case-sensitive except match if configured', function () {
            const predicate = { equals: { field: 'his is a test' }, except: '^t', caseSensitive: true },
                request = { field: 'This is a test' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if any value in a multi-value key is equal', function () {
            const predicate = { equals: { query: { key: '234' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no value in a multi-value key is equal', function () {
            const predicate = { equals: { query: { key: '23' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
