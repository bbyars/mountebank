'use strict';

var Q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    httpClient = require('./api/http/baseHttpClient').create('http'),
    headers = { connection: 'close' },
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb'),
    pidfile = 'test.pid';

function create (port) {

    function start (args) {
        var deferred = Q.defer(),
            mbArgs = [
                'restart',
                '--port', port,
                '--pidfile', pidfile,
                '--logfile', 'mb-test.log'
            ].concat(args || []),
            mb;

        if (isWindows) {
            mbArgs.unshift(mbPath);

            if (mbPath.indexOf('.cmd') >= 0) {
                mbArgs.unshift('/c');
                mb = spawn('cmd', mbArgs);
            }
            else {
                mb = spawn('node', mbArgs);
            }
        }
        else {
            mb = spawn(mbPath, mbArgs);
        }

        mb.on('error', deferred.reject);
        mb.stderr.on('data', function (data) {
            console.error(data.toString('utf8'));
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
        var deferred = Q.defer(),
            command = mbPath + ' stop --pidfile ' + pidfile;

        if (isWindows && mbPath.indexOf('.cmd') < 0) {
            command = 'node ' + command;
        }
        exec(command, function () {
            // Prevent address in use errors on the next start
            setTimeout(deferred.resolve, isWindows ? 1000 : 250);
        });

        return deferred.promise;
    }

    // After trial and error, I discovered that we have to set
    // the connection: close header on Windows or we end up with
    // ECONNRESET errors
    function get (endpoint) {
        return httpClient.responseFor({ method: 'GET', path: endpoint, port: port, headers: headers });
    }

    function post (endpoint, body) {
        return httpClient.responseFor({ method: 'POST', path: endpoint, port: port, body: body, headers: headers });
    }

    return {
        port: port,
        url: 'http://localhost:' + port,
        start: start,
        stop: stop,
        get: get,
        post: post
    };
}

module.exports = {
    create: create
};
