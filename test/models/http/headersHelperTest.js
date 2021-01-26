'use strict';

const assert = require('assert'),
    map = require('../../../src/models/http/headersMap');

describe('headersMap', function () {
    describe('#of', function () {
        describe('#get', function () {
            it('should search for the header with case-insensity', function () {
                const headers = map.of({
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value'
                });

                assert.strictEqual(headers.get('my-first-headEr'), 'first-value');
                assert.strictEqual(headers.get('my-SECOND-header'), 'second-value');
            });

            it('should return undefined if the header is not present', function () {
                const headers = map.of({});

                assert.strictEqual(typeof headers.get('Missing-Header'), 'undefined');
            });
        });

        describe('#set', function () {
            it('should not change the casing if the header exists', function () {
                const headers = map.of({
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value'
                });

                headers.set('my-first-headEr', 'new-value');

                assert.deepEqual(headers.all(), {
                    'My-First-header': 'new-value',
                    'my-Second-Header': 'second-value'
                });
            });

            it('should keep the casing intact for new headers', function () {
                const headers = map.of({
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value'
                });

                headers.set('My-Third-Header', 'third-value');

                assert.deepEqual(headers.all(), {
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value',
                    'My-Third-Header': 'third-value'
                });
            });
        });

        describe('#has', function () {
            it('should return false if key does not exist', function () {
                const headers = map.of({ first: 'one' });

                assert.strictEqual(headers.has('key'), false);
            });

            it('should return true even if key does not match case', function () {
                const headers = map.of({ key: 'value' });

                assert.strictEqual(headers.has('KEY'), true);
            });
        });
    });

    describe('#ofRaw', function () {
        it('should convert raw arrays into map, maintaining case', function () {
            const headers = map.ofRaw(['FIRST', 'one', 'KeY', 'value']);

            assert.deepStrictEqual(headers.all(), {
                FIRST: 'one',
                KeY: 'value'
            });
        });
    });
});
