'use strict';

var Q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.normalize(__dirname + '/../bin/mb');

function create (port) {
    var mb;

    function mbServer (command, args) {
        var deferred = Q.defer(),
            calledDone = false,
            mbArgs = [command, '--port', port, '--pidfile', 'test.pid'].concat(args || []);

        if (command == 'stop') {
            // Need to troubleshoot more; spawning 'mb stop' on Windows failed
            mb.kill();
            return Q(true);
        }

        if (isWindows) {
            mbArgs.unshift(mbPath);
            mb = spawn('node', mbArgs);
        }
        else {
            mb = spawn(mbPath, mbArgs);
        }

        ['stdout', 'stderr'].forEach(function (stream) {
            mb[stream].on('data', function (data) {
                var finished = command === 'stop' || data.toString('utf8').indexOf('now taking orders') >= 0;
                if (finished && !calledDone) {
                    calledDone = true;
                    deferred.resolve();
                }
            });
        });
        return deferred.promise;
    }

    return {
        port: port,
        start: function (args) { return mbServer('restart', args); },
        stop: function () { return mbServer('stop', []); }
    };
}

module.exports = {
    create: create
};
