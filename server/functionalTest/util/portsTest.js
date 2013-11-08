'use strict';

var assert = require('assert'),
    spawn = require('child_process').spawn,
    ports = require('../../src/util/ports');

describe('ports', function () {

    describe('#isPortInUse', function () {
        it('should return true if port already bound', function (done) {
            // Not a great test - assumes both that you have netcat installed,
            // and that port 3333 is currently unused.  Any better ideas?
            var netcat = spawn('nc', ['-l', 3333]);
            ports.isPortInUse(3333).then(function (result) {
                netcat.kill();
                assert(result);
                done();
            });
        });

        it('should return false if port is not bound', function (done) {
            ports.isPortInUse(3333).then(function (result) {
                assert(!result);
                done();
            });
        });
    });
});
