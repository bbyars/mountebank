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

function mochaParamsFor (testType) {
    return [
        'node_modules/.bin/mocha',
        '--forbid-only',
        '--forbid-pending',
        '--reporter',
        'mocha-multi-reporters',
        '--reporter-options',
        `configFile=mbTest/${testType}/config.json`,
        `mbTest/${testType}/**/*.js`
    ];
}

async function runTests () {
    const mbExitCode = await exec('node', ['tasks/tmp/mb.js', 'restart', '--allowInjection', '--mock', '--localOnly']);
    if (mbExitCode !== 0) {
        console.error('mb failed to start');
        process.exit(mbExitCode); // eslint-disable-line no-process-exit
    }

    const apiExitCode = await exec('node', mochaParamsFor('api'));
    await exec('node', ['tasks/tmp/mb.js', 'stop']);
    const cliExitCode = await exec('node', mochaParamsFor('cli'));
    return apiExitCode + cliExitCode;
}

runTests().then(code => process.exit(code)); // eslint-disable-line no-process-exit
