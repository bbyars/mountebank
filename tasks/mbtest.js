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
        'node_modules/mocha/bin/mocha',
        '--forbid-only',
        '--reporter',
        'mocha-multi-reporters',
        '--reporter-options',
        `configFile=mbTest/${testType}/config.json`,
        `mbTest/${testType}/**/*.js`
    ];
}

async function runTests () {
    const mbExitCode = await exec('node', ['tasks/mb.js', 'restart', '--allowInjection', '--localOnly']);
    if (mbExitCode !== 0) {
        console.error('mb failed to start');
        process.exit(mbExitCode); // eslint-disable-line no-process-exit
    }

    const testType = process.argv[2];
    const exitCode = await exec('node', mochaParamsFor(testType));
    await exec('node', ['tasks/mb.js', 'stop']);
    return exitCode;
}

runTests().then(code => process.exit(code)); // eslint-disable-line no-process-exit
