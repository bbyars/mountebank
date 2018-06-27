'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Logger = require('../../src/util/scopedLogger');

describe('scopedLogger', function () {
    describe('#create', function () {
        ['debug', 'info', 'warn', 'error'].forEach(function (level) {
            it('should prefix protocol name and port to all ' + level + ' calls', function () {
                var logger = { debug: mock(), info: mock(), warn: mock(), error: mock() },
                    scopedLogger = Logger.create(logger, 'prefix');

                scopedLogger[level]('log %s', level);

                assert.ok(logger[level].wasCalledWith(`[prefix] log ${level}`), logger[level].message());
            });
        });

        it('should allow nested scopes', function () {
            var logger = { debug: mock() },
                scopedLogger = Logger.create(logger, 'prefix').withScope('nested');

            scopedLogger.debug('log');

            assert.ok(logger.debug.wasCalledWith('[prefix] nested log'), logger.debug.message());
        });

        it('should allow changing scope', function () {
            var logger = { debug: mock() },
                scopedLogger = Logger.create(logger, 'original');

            scopedLogger.changeScope('changed');
            scopedLogger.debug('log');

            assert.ok(logger.debug.wasCalledWith('[changed] log'), logger.debug.message());
        });
    });
});
