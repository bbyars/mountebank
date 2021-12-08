'use strict';

const fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(process.cwd(), 'bin/mb'),
    port = process.env.MB_PORT || 2525,
    pidfile = 'mb.pid';

function delay (duration) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), duration);
    });
}

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

function shellCommand (args) {
    let command = mbPath;

    if (isWindows) {
        args.unshift(mbPath);
        command = 'node';
    }

    return command;
}

function spawnMb (args) {
    const command = shellCommand(args),
        mb = spawn(command, args, { detached: true, stdio: 'ignore' });

    console.log(`${command} ${args.join(' ')}`);
    mb.unref();
    return mb;
}

async function start (args) {
    const mbArgs = ['restart', '--port', port, '--pidfile', pidfile].concat(args || []);

    if (process.env.MB_PERSISTENT === 'true') {
        mbArgs.push('--datadir');
        mbArgs.push('.mbdb');
    }

    return new Promise((resolve, reject) => {
        whenFullyInitialized('start', resolve);
        const mb = spawnMb(mbArgs);
        mb.on('error', reject);
    });
}

async function stop () {
    let command = `${mbPath} stop --pidfile ${pidfile}`;

    if (isWindows) {
        command = `node ${command}`;
    }

    return new Promise(resolve => {
        console.log(command);
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
    let mbArgs = [command, '--port', port].concat(args || []);

    return new Promise((resolve, reject) => {
        const mb = spawnMb(mbArgs);
        mb.on('error', reject);
        mb.on('exit', resolve);
    });
}

async function save (args) {
    return execCommand('save', args);
}

async function replay (args) {
    return execCommand('replay', args);
}

async function execute (command, args) {
    switch (command) {
        case 'start':
            await start(args);
            break;
        case 'restart':
            await restart(args);
            break;
        case 'stop':
            await stop(args);
            break;
        case 'save':
            await save(args);
            break;
        case 'replay':
            await replay(args);
            break;
        default:
            throw new Error(`invalid command: ${command}`);
    }
}

const command = process.argv[2],
    args = process.argv.slice(3);

execute(command, args)
    .then(() => process.exit(0)) // eslint-disable-line no-process-exit
    .catch(err => {
        console.error(err);
        process.exit(1); // eslint-disable-line no-process-exit
    });
