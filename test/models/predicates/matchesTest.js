'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', () => {
    describe('#matches', () => {
        it('should return false for request field not matching expected', () => {
            const predicate = { matches: { field: 'middle$' } },
                request = { field: 'begin middle end' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for request field matching expected', () => {
            const predicate = { matches: { field: 'end$' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case-insensitive by default', () => {
            const predicate = { matches: { field: 'END$' } },
                request = { field: 'begin middle End' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case sensitivity', () => {
            const predicate = { matches: { field: 'END$' }, caseSensitive: true },
                request = { field: 'begin middle End' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should not provide case-insensitivity by transforming regex', () => {
            const predicate = { matches: { field: '\\d\\D\\d' } },
                request = { field: '1a2' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should match key-value pairs for objects', () => {
            const predicate = { matches: { headers: { field: 'end$' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object', () => {
            const predicate = { matches: { headers: { field: 'end$' } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false if key for object does not matches string', () => {
            const predicate = { matches: { headers: { field: 'begin\\d+' } } },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should throw an error if encoding is base64', () => {
            try {
                const predicate = { matches: { field: 'dGVzdA==' } },
                    request = { field: 'dGVzdA==' };
                predicates.evaluate(predicate, request, 'base64');
                assert.fail('should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.code, 'bad data');
                assert.strictEqual(error.message, 'the matches predicate is not allowed in binary mode');
            }
        });

        it('should return true if repeating query key has value matching string', () => {
            const predicate = { matches: { query: { key: 'iddle$' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have value matching string', () => {
            const predicate = { matches: { query: { key: '^iddle' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if repeating query key has value matching array', () => {
            const predicate = { matches: { query: { key: ['^begin', '^middle', 'end$'] } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have value matching array', () => {
            const predicate = { matches: { query: { key: ['^begin', '^middle', '^nd'] } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if repeating query key has value matching array object', () => {
            const predicate = { matches: { query: { key: [{ key1: 'value1$' }, { key1: '^value2' }] } } },
                request = { query: { key: [{ key1: 'value1' }, { key1: 'value2' }] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have matching array object', () => {
            const predicate = { matches: { query: { key: [{ key1: 'value1$' }, { key1: '^value2' }] } } },
                request = { query: { key: [{ key1: 'value1' }, { key1: '^alue2' }] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be case insensitive for object keys by default (issue #169)', () => {
            const predicate = { matches: { headers: { field: 'end$' } } },
                request = { headers: { FIELD: 'begin middle end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be false if case on object key differs and configured to be case sensitive', () => {
            const predicate = { matches: { headers: { field: 'end$' } }, caseSensitive: true },
                request = { headers: { FIELD: 'begin middle end' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be false if case on value differs and configured to be case sensitive', () => {
            const predicate = { matches: { headers: { field: 'end$' } }, caseSensitive: true },
                request = { headers: { field: 'begin middle END' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should be true if case on object key same and configured to be case sensitive', () => {
            const predicate = { matches: { headers: { field: 'end$' } }, caseSensitive: true },
                request = { headers: { field: 'begin middle end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
