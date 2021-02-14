'use strict';

const spawn = require('child_process').spawn;

function exec (command, args) {
    return new Promise(resolve => {
        const process = spawn(command, args, { stdio: 'inherit' });
        process.on('exit', code => resolve(code));
        process.on('error', err => {
            console.error(err);
            resolve(1);
        });
    });
}

async function runTests () {
    const mbExitCode = await exec('node', ['tasks/tmp/mb.js', 'restart', '--allowInjection', '--mock', '--localOnly']);
    if (mbExitCode !== 0) {
        console.error('mb failed to start');
        process.exit(mbExitCode); // eslint-disable-line no-process-exit
    }

    const mochaExitCode = await exec('node', ['node_modules/.bin/mocha', '--forbid-only', '--forbid-pending', 'functionalTest/**/*.js']);
    await exec('node', ['tasks/tmp/mb.js', 'stop']);
    return mochaExitCode;
}

runTests().then(code => process.exit(code)); // eslint-disable-line no-process-exit
