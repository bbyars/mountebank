'use strict';

var Q = require('q'),
    fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    httpClient = require('./api/http/baseHttpClient').create('http'),
    headers = { connection: 'close' },
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb'),
    pidfile = 'test.pid',
    logfile = 'mb-test.log';

function whenFullyInitialized (operation, callback) {
    var count = 0,
        pidfileMustExist = operation === 'start',
        spinWait = function () {
            count += 1;
            if (count > 20) {
                console.log('ERROR: mb ' + operation + ' not initialized after 2 seconds');
                callback({});
            }
            else if (fs.existsSync(pidfile) === pidfileMustExist) {
                callback({});
            }
            else {
                Q.delay(100).done(spinWait);
            }
        };

    spinWait();
}

function spawnMb (args) {
    var command = mbPath,
        result;

    if (isWindows) {
        args.unshift(mbPath);

        if (mbPath.indexOf('.cmd') >= 0) {
            // Accommodate the self-contained Windows zip files that ship with mountebank
            args.unshift('/c');
            command = 'cmd';
        }
        else {
            command = 'node';
        }
    }

    result = spawn(command, args);
    result.stderr.on('data', function (data) {
        console.log(data.toString('utf8'));
    });
    return result;
}

function create (port) {

    var mb;

    function start (args) {
        var deferred = Q.defer(),
            mbArgs = ['restart', '--port', port, '--logfile', logfile, '--pidfile', pidfile].concat(args || []);

        whenFullyInitialized('start', deferred.resolve);
        mb = spawnMb(mbArgs);
        mb.on('error', deferred.reject);

        return deferred.promise;
    }

    function stop () {
        var deferred = Q.defer();
        if (mb) {
            mb.on('exit', () => {
                mb = null;
                deferred.resolve();
            });
            mb.kill();
        }
        else {
            process.nextTick(() => { deferred.resolve(); });
        }
        return deferred.promise;
    }

    function restart (args) {
        // Can't simply call mb restart
        // The start function relies on whenFullyInitialized to wait for the pidfile to already exist
        // If it already does exist, and you're expecting mb restart to kill it, the function will
        // return before you're ready for it
        return stop(args).then(function () {
            return start(args);
        });
    }

    function execCommand (command, args) {
        var deferred = Q.defer(),
            mbArgs = [command, '--port', port].concat(args || []),
            mbCommand,
            stdout = '',
            stderr = '';

        mbCommand = spawnMb(mbArgs);
        mbCommand.on('error', deferred.reject);
        mbCommand.stdout.on('data', function (chunk) { stdout += chunk; });
        mbCommand.stderr.on('data', function (chunk) { stderr += chunk; });
        mbCommand.on('close', function (exitCode) {
            deferred.resolve({
                exitCode: exitCode,
                stdout: stdout,
                stderr: stderr
            });
        });

        return deferred.promise;
    }

    function save (args) {
        return execCommand('save', args);
    }

    function replay (args) {
        return execCommand('replay', args);
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
        restart: restart,
        stop: stop,
        save: save,
        get: get,
        post: post,
        replay: replay
    };
}

module.exports = {
    create: create
};
