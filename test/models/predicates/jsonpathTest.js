'use strict';

const assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', () => {
    describe('jsonpath', () => {
        it('#equals should be false if field is not JSON', () => {
            const predicate = {
                    equals: { field: 'VALUE' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: 'VALUE' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#equals should be true if value in provided json', () => {
            const predicate = {
                    equals: { field: 'VALUE' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'VALUE' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#equals should be false if value provided json expression does not equal', () => {
            const predicate = {
                    equals: { field: 'NOT VALUE' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'VALUE' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#equals should use case-insensitive json selector by default', () => {
            const predicate = {
                    equals: { field: 'VALUE' },
                    jsonpath: { selector: '$..Title' }
                },
                request = { field: JSON.stringify({ title: 'VALUE' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#equals should not equal if case-sensitive json selector does not match', () => {
            const predicate = {
                    equals: { field: 'value' },
                    jsonpath: { selector: '$..title' },
                    caseSensitive: true
                },
                request = { field: JSON.stringify({ TITLE: 'value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#equals should equal if case-sensitive jsonpath selector matches', () => {
            const predicate = {
                    equals: { field: 'value' },
                    jsonpath: { selector: '$..Title' },
                    caseSensitive: true
                },
                request = { field: JSON.stringify({ Title: 'value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#equals should equal if case-sensitive jsonpath selector matches, stripping out the exception', () => {
            const predicate = {
                    equals: { field: 've' },
                    jsonpath: { selector: '$..Title' },
                    caseSensitive: true,
                    except: 'alu'
                },
                request = { field: JSON.stringify({ Title: 'value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#equals should not equal if case-sensitive jsonpath selector matches, but stripped values differ', () => {
            const predicate = {
                    equals: { field: 'v' },
                    jsonpath: { selector: '$..Title' },
                    caseSensitive: true,
                    except: 'alu'
                },
                request = { field: JSON.stringify({ Title: 'value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be false if field is not JSON and jsonpath selector used', () => {
            const predicate = {
                    deepEquals: { field: 'VALUE' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: 'VALUE' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be false if value in provided jsonpath attribute expression does not equal', () => {
            const predicate = {
                    deepEquals: { field: 'NOT VALUE' },
                    jsonpath: { selector: '$.title..attribute' }
                },
                request = { field: JSON.stringify({ Title: { attribute: 'value' } }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be true if singly embedded value in provided jsonpath attribute expression does equal', () => {
            const predicate = {
                    deepEquals: { field: 'value' },
                    jsonpath: { selector: '$.title.attribute' }
                },
                request = { field: JSON.stringify({ title: { attribute: 'value' } }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be true if doubly embedded value in provided jsonpath attribute expression does equal', () => {
            const predicate = {
                    deepEquals: { field: 'value' },
                    jsonpath: { selector: '$.title.attribute.test' }
                },
                request = { field: JSON.stringify({ title: { attribute: { test: 'value' } } }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be true if embedded values are provided jsonpath attribute expression does equal', () => {
            const predicate = {
                    deepEquals: { field: ['value', 'other value'] },
                    jsonpath: { selector: '$.title..attribute' }
                },
                request = { field: JSON.stringify({ title: [{ attribute: 'value' }, { attribute: 'other value' }] }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#deepEquals should return a string if looking at an index of 1 item', () => {
            const predicate = {
                    deepEquals: { field: 'value' },
                    jsonpath: { selector: '$..title[0].attribute' }
                },
                request = { field: JSON.stringify({ title: [{ attribute: 'value' }, { attribute: 'other value' }] }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be true if embedded values are provided jsonpath attribute expression out of order', () => {
            const predicate = {
                    deepEquals: { field: ['other value', 'value'] },
                    jsonpath: { selector: '$.title..attribute' }
                },
                request = { field: JSON.stringify({ title: [{ attribute: 'value' }, { attribute: 'other value' }] }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be false if does not get all embedded values provided jsonpath attribute expression', () => {
            const predicate = {
                    deepEquals: { field: ['value', 'other value'] },
                    jsonpath: { selector: '$.title..attribute' }
                },
                request = { field: JSON.stringify({ title: [{ attribute: 'value' }, { attribute: 'other value' }, { attribute: 'last value' }] }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#contains should be true if direct text value contains predicate', () => {
            const predicate = {
                    contains: { field: 'value' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'this is a value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#contains should be false if direct text value does not contain predicate', () => {
            const predicate = {
                    contains: { field: 'VALUE' },
                    jsonpath: { selector: '$..title' },
                    caseSensitive: true
                },
                request = { field: JSON.stringify({ title: 'this is a value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#startsWith should be true if direct namespaced jsonpath selection starts with value', () => {
            const predicate = {
                    startsWith: { field: 'this' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'this is a value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#startsWith should be false if direct namespaced jsonpath selection does not start with value', () => {
            const predicate = {
                    startsWith: { field: 'this' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'if this is a value, it is a value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#exists should be true if jsonpath selector has at least one result', () => {
            const predicate = {
                    exists: { field: true },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#exists should be false if jsonpath selector does not match', () => {
            const predicate = {
                    exists: { field: true },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ newTitle: 'if this is a value, it is a value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#matches should be true if selected value matches regex', () => {
            const predicate = {
                    matches: { field: '^v' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'value' }) };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#matches should be false if selected value does not match regex', () => {
            const predicate = {
                    matches: { field: 'v$' },
                    jsonpath: { selector: '$..title' }
                },
                request = { field: JSON.stringify({ title: 'value' }) };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('#deepEquals should be true if boolean value matches', () => {
            const predicate = {
                    deepEquals: { field: false },
                    jsonpath: { selector: '$..active' }
                },
                request = { field: '{ "active": false }' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#equals should be true if boolean value matches', () => {
            const predicate = {
                    equals: { field: false },
                    jsonpath: { selector: '$..active' }
                },
                request = { field: '{ "active": false }' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('#matches without case sensitivity should maintain selector to match JSON (issue #361)', () => {
            const predicate = {
                    matches: { body: '111\\.222\\.333\\.*' },
                    jsonpath: { selector: '$.ipAddress' }
                },
                request = { body: '{ "ipAddress": "111.222.333.456" }' };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
