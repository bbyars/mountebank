'use strict';

var assert = require('assert'),
    headersHelper = require('../../../src/models/http/headersHelper');

describe.only('headersHelper', function () {
    describe('#getJar', function () {
        describe('#get', function () {
            it('should search for the header with case-insensity', function () {
                var request = {
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
                var request = {
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
                var request = {
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
                var request = {
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
