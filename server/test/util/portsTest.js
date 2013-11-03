'use strict';

var assert = require('assert'),
    ports = require('../../src/util/ports');

describe('ports', function () {

    describe('#isValidPortNumber', function () {
        it('should not accept undefined', function () {
            assert(!ports.isValidPortNumber(undefined));
        });

        it('should not accept floats', function () {
            assert(!ports.isValidPortNumber(123.1));
        });

        it('should be in the correct range', function () {
            assert(!ports.isValidPortNumber(0));
            assert(ports.isValidPortNumber(1));
            assert(ports.isValidPortNumber(65535));
            assert(!ports.isValidPortNumber(65536));
        });
    });
});

