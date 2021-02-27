'use strict';

const fs = require('fs-extra'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    httpClient = require('./baseHttpClient').create('http'),
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb'),
    pidfile = 'test.pid',
    logfile = 'mb-test.log';

function delay (duration) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), duration);
    });
}

function create (port, includeStdout) {

    let host = 'localhost';

    async function whenFullyInitialized (operation, callback) {
        let count = 0,
            pidfileMustExist = operation === 'start',
            spinWait = async () => {
                count += 1;
                if (count > 20) {
                    console.log(`ERROR: mb ${operation} not initialized after 2 seconds`);
                    callback({});
                }
                else if (fs.existsSync(pidfile) === pidfileMustExist) {
                    callback({});
                }
                else {
                    await delay(100);
                    await spinWait();
                }
            };

        await spinWait();
    }

    function spawnMb (args) {
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
        if (includeStdout) {
            result.stdout.on('data', data => {
                console.log(data.toString('utf8'));
            });
        }
        return result;
    }

    async function start (args) {
        const mbArgs = ['restart', '--port', port, '--logfile', logfile, '--pidfile', pidfile].concat(args || []),
            hostIndex = mbArgs.indexOf('--host');

        if (hostIndex >= 0) {
            host = mbArgs[hostIndex + 1];
        }
        else {
            host = 'localhost';
        }

        return new Promise((resolve, reject) => {
            whenFullyInitialized('start', resolve);
            const mb = spawnMb(mbArgs);
            mb.on('error', reject);
        });
    }

    async function stop () {
        let command = `${mbPath} stop --pidfile ${pidfile}`;

        if (isWindows && mbPath.indexOf('.cmd') < 0) {
            command = `node ${command}`;
        }

        return new Promise(resolve => {
            exec(command, (error, stdout, stderr) => {
                if (error) { throw error; }
                if (stdout) { console.log(stdout); }
                if (stderr) { console.error(stderr); }

                whenFullyInitialized('stop', resolve);
            });
        });
    }

    // Can't simply call mb restart
    // The start function relies on whenFullyInitialized to wait for the pidfile to already exist
    // If it already does exist, and you're expecting mb restart to kill it, the function will
    // return before you're ready for it
    async function restart (args) {
        await stop(args);
        await start(args);
    }

    async function execCommand (command, args) {
        let mbArgs = [command, '--port', port].concat(args || []),
            stdout = '',
            stderr = '';

        return new Promise((resolve, reject) => {
            const mb = spawnMb(mbArgs);
            mb.on('error', reject);
            mb.stdout.on('data', chunk => { stdout += chunk; });
            mb.stderr.on('data', chunk => { stderr += chunk; });
            mb.on('close', exitCode => {
                resolve({
                    exitCode: exitCode,
                    stdout: stdout,
                    stderr: stderr
                });
            });
        });
    }

    async function save (args) {
        return await execCommand('save', args);
    }

    async function replay (args) {
        return await execCommand('replay', args);
    }

    function get (endpoint) {
        return httpClient.responseFor({ method: 'GET', path: endpoint, port, hostname: host });
    }

    function post (endpoint, body) {
        return httpClient.responseFor({ method: 'POST', path: endpoint, port, body, hostname: host });
    }

    function put (endpoint, body) {
        return httpClient.responseFor({ method: 'PUT', path: endpoint, port, body, hostname: host });
    }

    function del (endpoint) {
        return httpClient.responseFor({ method: 'DELETE', path: endpoint, port, hostname: host });
    }

    return { port, url: `http://localhost:${port}`, start, restart, stop, save, get, post, put, del, replay };
}

module.exports = { create };
