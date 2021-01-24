'use strict';

const assert = require('assert'),
    headersHelper = require('../../../src/models/http/headersHelper');

describe('headersHelper', function () {
    describe('#getHeader', function () {
        it('should search for the header with case-insensity', function () {
            const request = {
                    headers: {
                        'My-First-header': 'first-value',
                        'my-Second-Header': 'second-value'
                    }
                },
                getHeader = headersHelper.getHeader;

            assert.equal(getHeader('my-first-headEr', request.headers), 'first-value');
            assert.equal(getHeader('my-SECOND-header', request.headers), 'second-value');
        });

        it('should return undefined if the header is not present', function () {
            const request = {
                    headers: {
                        'My-First-header': 'first-value',
                        'my-Second-Header': 'second-value'
                    }
                },
                getHeader = headersHelper.getHeader;

            assert.equal(getHeader('Missing-Header', request.headers), undefined);
        });
    });

    describe('#setHeader', function () {
        it('should not change the casing if the header exists', function () {
            const request = {
                headers: {
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value'
                }
            };

            headersHelper.setHeader('my-first-headEr', 'new-value', request.headers);
            assert.deepEqual(
                request.headers,
                {
                    'My-First-header': 'new-value',
                    'my-Second-Header': 'second-value'
                }
            );
        });

        it('should keep the casing intact for new headers', function () {
            const request = {
                headers: {
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value'
                }
            };

            headersHelper.setHeader('My-Third-Header', 'third-value', request.headers);
            assert.deepEqual(
                request.headers,
                {
                    'My-First-header': 'first-value',
                    'my-Second-Header': 'second-value',
                    'My-Third-Header': 'third-value'
                }
            );
        });
    });

    describe('#getJar', function () {
        describe('#get', function () {
            it('should search for the header with case-insensity', function () {
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

            it('should return undefined if the header is not present', function () {
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

        describe('#set', function () {
            it('should not change the casing if the header exists', function () {
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

            it('should keep the casing intact for new headers', function () {
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
