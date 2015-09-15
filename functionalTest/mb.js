'use strict';

var Q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.normalize(__dirname + '/../bin/mb'),
    pidfile = 'test.pid',
    killWait = isWindows ? 1000 : 0;

function create (port) {
    function start (args) {
        var deferred = Q.defer(),
            mbArgs = ['restart', '--port', port, '--pidfile', pidfile].concat(args || []),
            mb;

        if (isWindows) {
            mbArgs.unshift(mbPath);
            mb = spawn('node', mbArgs);
        }
        else {
            mb = spawn(mbPath, mbArgs);
        }

        mb.on('error', deferred.reject);
        mb.stderr.on('data', function (data) {
            console.error(data.toString('utf8'));
            deferred.resolve();
        });
        mb.stdout.on('data', function (data) {
            // Looking for "mountebank va.b.c (node vx.y.z) now taking orders..."
            if (data.toString('utf8').indexOf('now taking orders') > 0) {
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    function stop () {
        var deferred = Q.defer();
        exec(mbPath + ' stop --pidfile ' + pidfile, function () {
            // Need a delay or get an address in use error
            setTimeout(deferred.resolve, killWait);
        });
        return deferred.promise;
    }

    return {
        port: port,
        start: start,
        stop: stop
    };
}

module.exports = {
    create: create
};
