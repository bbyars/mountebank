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

                assert.ok(logger[level].wasCalledWith('[prefix] log %s', level), logger[level].message());
            });
        });
    });
});
