'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', () => {
    describe('#contains', () => {
        it('should return false for request field not containing expected', () => {
            const predicate = { contains: { field: 'middle' } },
                request = { field: 'begin end' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for request field containing expected', () => {
            const predicate = { contains: { field: 'middle' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case insensitive by default', () => {
            const predicate = { contains: { field: 'MIDDLE' } },
                request = { field: 'begin Middle end' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case sensitivity', () => {
            const predicate = { contains: { field: 'MIDDLE' }, caseSensitive: true },
                request = { field: 'begin Middle end' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match key-value pairs for objects', () => {
            const predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: { key: 'begin middle end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object', () => {
            const predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false if key for object does not contain string', () => {
            const predicate = { contains: { headers: { key: 'middle' } } },
                request = { headers: { key: 'begin end' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match values in a case insensitive fashion for objects', () => {
            const predicate = { contains: { headers: { key: 'Middle' } } },
                request = { headers: { key: 'begin MIDDLE end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case sensitivity when matching values for objects', () => {
            const predicate = { contains: { headers: { key: 'Middle' } }, caseSensitive: true },
                request = { headers: { key: 'begin MIDDLE end' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if contains binary sequence and encoding is base64', () => {
            const predicate = { contains: { field: new Buffer([2, 3]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return false if not contains binary sequence and encoding is base64', () => {
            const predicate = { contains: { field: new Buffer([2, 4]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return true if repeating query key contains value', () => {
            const predicate = { contains: { query: { key: '123' } } },
                request = { query: { key: ['123', '234'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true if repeating query key contains value with the right substring', () => {
            const predicate = { contains: { query: { key: 'mid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not contain value', () => {
            const predicate = { contains: { query: { key: 'bid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if array predicate matches actual array', () => {
            const predicate = { contains: { field: ['be', 'nd', 'iddl'] } },
                request = { field: ['begin', 'middle', 'end'] };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have value matching array', () => {
            const predicate = { contains: { query: { key: ['be', 'nd', 'iddl', 'wtf'] } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if all values in predicate definition in array even if array has more elements', () => {
            const predicate = { contains: { query: { key: ['fi', 'se'] } } },
                request = { query: { key: ['first', 'second', 'third'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return true if repeating query key has value matching array object', () => {
            const predicate = { contains: { query: { key: [{ key1: '1' }, { key1: '2' }] } } },
                request = { query: { key: [{ key1: 'value1' }, { key1: 'value2' }] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have matching array object', () => {
            const predicate = { contains: { query: { key: [{ key1: '1' }, { key1: '2' }] } } },
                request = { query: { key: [{ key1: 'value1' }, { key1: 'value3' }] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
