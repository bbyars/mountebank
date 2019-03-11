'use strict';

const assert = require('assert'),
    compatibility = require('../../src/models/compatibility');

describe('compatibility', function () {
    describe('#upcast', function () {
        it('should change string shellTransform to array', function () {
            const request = {
                stubs: [{
                    responses: [{
                        _behaviors: { shellTransform: 'command' }
                    }]
                }]
            };

            compatibility.upcast(request);

            assert.deepEqual(request, {
                stubs: [{
                    responses: [{
                        _behaviors: { shellTransform: ['command'] }
                    }]
                }]
            });
        });

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
