'use strict';

const assert = require('assert'),
    compatibility = require('../../src/models/compatibility');

describe('compatibility', function () {
    describe('#upcast', function () {
        it('should switch tcp proxy objects to URL strings', function () {
            const request = {
                protocol: 'tcp',
                stubs: [
                    {
                        responses: [
                            { is: { data: 'is-response' } },
                            { proxy: { to: { host: 'host-1', port: 'port-1' } } }
                        ]
                    },
                    {
                        responses: [{ proxy: { to: 'url' } }]
                    },
                    {
                        responses: [{ proxy: { to: { host: 'host-2', port: 'port-2' } } }]
                    }
                ]
            };

            compatibility.upcast(request);

            assert.deepEqual(request, {
                protocol: 'tcp',
                stubs: [
                    {
                        responses: [
                            { is: { data: 'is-response' } },
                            { proxy: { to: 'tcp://host-1:port-1' } }
                        ]
                    },
                    {
                        responses: [{ proxy: { to: 'url' } }]
                    },
                    {
                        responses: [{ proxy: { to: 'tcp://host-2:port-2' } }]
                    }
                ]
            });
        });

        it('should convert _behaviors object to array in the right order', function () {
            const request = {
                stubs: [{
                    responses: [{
                        _behaviors: {
                            decorate: '(config) => {}',
                            shellTransform: 'shellTransform.js',
                            copy: [{ from: 'copy' }],
                            lookup: [{ from: 'lookup' }],
                            wait: 100,
                            repeat: 2
                        }
                    }]
                }]
            };

            compatibility.upcast(request);

            assert.deepEqual(request, {
                stubs: [{
                    responses: [{
                        _behaviors: [
                            { repeat: 2 },
                            { wait: 100 },
                            { lookup: { from: 'lookup' } },
                            { copy: { from: 'copy' } },
                            { shellTransform: 'shellTransform.js' },
                            { decorate: '(config) => {}' }
                        ]
                    }]
                }]
            });
        });

        it('should convert _behavior arrays to multiple objects', function () {
            const request = {
                stubs: [{
                    responses: [{
                        _behaviors: {
                            repeat: 2,
                            wait: 100,
                            lookup: [{ from: 'lookup-1' }, { from: 'lookup-2' }],
                            copy: [{ from: 'copy-1' }, { from: 'copy-2' }],
                            shellTransform: ['shell-1', 'shell-2'],
                            decorate: '(config) => {}'
                        }
                    }]
                }]
            };

            compatibility.upcast(request);

            assert.deepEqual(request, {
                stubs: [{
                    responses: [{
                        _behaviors: [
                            { repeat: 2 },
                            { wait: 100 },
                            { lookup: { from: 'lookup-1' } },
                            { lookup: { from: 'lookup-2' } },
                            { copy: { from: 'copy-1' } },
                            { copy: { from: 'copy-2' } },
                            { shellTransform: 'shell-1' },
                            { shellTransform: 'shell-2' },
                            { decorate: '(config) => {}' }
                        ]
                    }]
                }]
            });
        });
    });

    describe('#downcastInjectionConfig', function () {
        it('should do nothing for new protocol request formats', function () {
            const config = {
                request: { key: 'value' }
            };

            compatibility.downcastInjectionConfig(config);

            assert.deepEqual(config, { request: { key: 'value' } });
        });

        it('should add all request fields for backwards compatibility', function () {
            const config = {
                request: { method: 'GET', path: '/' }
            };

            compatibility.downcastInjectionConfig(config);

            assert.deepEqual(config, {
                request: { method: 'GET', path: '/' },
                method: 'GET',
                path: '/'
            });
        });
    });
});
