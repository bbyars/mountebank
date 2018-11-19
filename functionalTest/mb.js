'use strict';

const Q = require('q'),
    fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    httpClient = require('./api/http/baseHttpClient').create('http'),
    headers = { connection: 'close' },
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb'),
    pidfile = 'test.pid',
    logfile = 'mb-test.log';

const whenFullyInitialized = (operation, callback) => {
    let count = 0,
        pidfileMustExist = operation === 'start',
        spinWait = () => {
            count += 1;
            if (count > 20) {
                console.log(`ERROR: mb ${operation} not initialized after 2 seconds`);
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
};

const spawnMb = args => {
    let command = mbPath;
    let result;

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
    result.stderr.on('data', data => {
        console.log(data.toString('utf8'));
    });
    return result;
};

const create = port => {
    const start = args => {
        const deferred = Q.defer(),
            mbArgs = ['restart', '--port', port, '--logfile', logfile, '--pidfile', pidfile].concat(args || []);

        whenFullyInitialized('start', deferred.resolve);
        const mb = spawnMb(mbArgs);
        mb.on('error', deferred.reject);

        return deferred.promise;
    };

    const stop = () => {
        let deferred = Q.defer(),
            command = `${mbPath} stop --pidfile ${pidfile}`;

        if (isWindows && mbPath.indexOf('.cmd') < 0) {
            command = `node ${command}`;
        }
        exec(command, (error, stdout, stderr) => {
            if (error) { throw error; }
            if (stdout) { console.log(stdout); }
            if (stderr) { console.error(stderr); }

            whenFullyInitialized('stop', deferred.resolve);
        });

        return deferred.promise;
    };

    // Can't simply call mb restart
    // The start function relies on whenFullyInitialized to wait for the pidfile to already exist
    // If it already does exist, and you're expecting mb restart to kill it, the function will
    // return before you're ready for it
    const restart = args => stop(args).then(() => start(args));

    const execCommand = (command, args) => {
        let deferred = Q.defer(),
            mbArgs = [command, '--port', port].concat(args || []),
            stdout = '',
            stderr = '',
            mb = spawnMb(mbArgs);

        mb.on('error', deferred.reject);
        mb.stdout.on('data', chunk => { stdout += chunk; });
        mb.stderr.on('data', chunk => { stderr += chunk; });
        mb.on('close', exitCode => {
            deferred.resolve({
                exitCode: exitCode,
                stdout: stdout,
                stderr: stderr
            });
        });

        return deferred.promise;
    };

    const save = args => execCommand('save', args);
    const replay = args => execCommand('replay', args);

    // After trial and error, I discovered that we have to set
    // the connection: close header on Windows or we end up with
    // ECONNRESET errors
    const get = endpoint => httpClient.responseFor({ method: 'GET', path: endpoint, port, headers });
    const post = (endpoint, body) => httpClient.responseFor({ method: 'POST', path: endpoint, port, body, headers });

    return { port, url: `http://localhost:${port}`, start, restart, stop, save, get, post, replay };
};

module.exports = { create };
