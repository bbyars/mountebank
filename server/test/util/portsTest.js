'use strict';

var assert = require('assert'),
    ports = require('../../src/util/ports');

describe('ports', function () {

    describe('#isValidPortNumber', function () {
        it('should not accept undefined', function () {
            assert(!ports.isValidPortNumber(undefined));
        });

        it('should not accept floats', function () {
            assert(!ports.isValidPortNumber(123.1))
        });

        it('should be in the correct range', function () {
            assert(!ports.isValidPortNumber(0));
            assert(ports.isValidPortNumber(1));
            assert(ports.isValidPortNumber(65535));
            assert(!ports.isValidPortNumber(65536));
        });
    });
});


//var testCase = require('nodeunit').testCase,
//    spawn = require('child_process').spawn,

//
//    'isPortInUse detects used port': function (test) {
//        // Not a great test - assumes both that you have netcat installed,
//        // and that port 3333 is currently unused.  Any better ideas?
//        var netcat = spawn('nc', ['-l', 3333]);
//        isPortInUse(3333, function (isInUse) {
//            test.ok(isInUse);
//            netcat.kill();
//            test.done();
//        });
//    },
//
//    'isPortInUse detects unused port': function (test) {
//        isPortInUse(3333, function (isInUse) {
//            test.notOk(isInUse);
//            test.done();
//        });
//    }
//});
