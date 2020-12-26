'use strict';

const assert = require('assert'),
    ip = require('../../src/util/ip'),
    Logger = require('../fakes/fakeLogger');

describe('ip', function () {
    describe('#createIPVerification', function () {
        let logger;

        beforeEach(function () {
            logger = Logger.create();
        });

        it('should accept local ips if localOnly is true', function () {
            const options = {
                    localOnly: true,
                    ipWhitelist: ['*']
                },
                isAllowedConnection = ip.createIPVerification(options);

            assert.strictEqual(true, isAllowedConnection('127.0.0.1', logger));
        });

        it('should not accept remote ip if localOnly is true', function () {
            const options = {
                    localOnly: true,
                    ipWhitelist: ['*']
                },
                isAllowedConnection = ip.createIPVerification(options);

            assert.strictEqual(false, isAllowedConnection('10.10.10.10', logger));
            logger.warn.assertLogged('Blocking incoming connection from 10.10.10.10. Turn off --localOnly or add to --ipWhitelist to allow');
        });

        it('should allow any IP if localOnly is false and ipWhitelist contains *', function () {
            const options = {
                    ipWhitelist: ['127.0.0.1', '*', '10.10.10.10'],
                    localOnly: false
                },
                isAllowedConnection = ip.createIPVerification(options);

            assert.strictEqual(true, isAllowedConnection('anything', logger));
        });

        it('should ignore a * if localOnly is true', function () {
            const options = {
                    ipWhitelist: ['*'],
                    localOnly: true
                },
                isAllowedConnection = ip.createIPVerification(options);

            assert.strictEqual(false, isAllowedConnection('anything', logger));
        });

        it('should not block if no ip provided', function () {
            const options = {
                    localOnly: true,
                    ipWhitelist: ['*']
                },
                isAllowedConnection = ip.createIPVerification(options);

            assert.strictEqual(false, isAllowedConnection(undefined, logger));
            logger.error.assertLogged('Blocking request because no IP address provided. This is likely a bug in the protocol implementation.');
        });
    });
});
