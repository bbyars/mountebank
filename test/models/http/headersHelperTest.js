'use strict';

const assert = require('assert'),
    headersHelper = require('../../../src/models/http/headersHelper');

describe('headersHelper', () => {
    describe('#getJar', () => {
        describe('#get', () => {
            it('should search for the header with case-insensity', () => {
                const request = {
                        headers: {
                            'My-First-header': 'first-value',
                            'my-Second-Header': 'second-value'
                        }
                    },
                    headersJar = headersHelper.getJar(request.headers);

                assert.equal(headersJar.get('my-first-headEr'), 'first-value');
                assert.equal(headersJar.get('my-SECOND-header'), 'second-value');
            });

            it('should return undefined if the header is not present', () => {
                const request = {
                        headers: {
                            'My-First-header': 'first-value',
                            'my-Second-Header': 'second-value'
                        }
                    },
                    headersJar = headersHelper.getJar(request.headers);

                assert.equal(headersJar.get('Missing-Header'), undefined);
            });
        });

        describe('#set', () => {
            it('should not change the casing if the header exists', () => {
                const request = {
                        headers: {
                            'My-First-header': 'first-value',
                            'my-Second-Header': 'second-value'
                        }
                    },
                    headersJar = headersHelper.getJar(request.headers);

                headersJar.set('my-first-headEr', 'new-value');
                assert.equal(request.headers['My-First-header'], 'new-value');
            });

            it('should keep the casing intact for new headers', () => {
                const request = {
                        headers: {
                            'My-First-header': 'first-value',
                            'my-Second-Header': 'second-value'
                        }
                    },
                    headersJar = headersHelper.getJar(request.headers);

                headersJar.set('My-Third-Header', 'third-value');
                assert.equal(request.headers['My-Third-Header'], 'third-value');
            });
        });
    });
});
