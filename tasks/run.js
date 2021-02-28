'use strict';

const spawn = require('child_process').spawn,
    os = require('os');

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

async function run (command, args, options) {
    if (isWindows()) {
        // spawn on Windows requires an exe
        args.unshift(command);
        args.unshift('/c');
        command = 'cmd.exe';
    }

    options.stdio = 'inherit';

    console.log(`${command} ${args.join(' ')} with ${JSON.stringify(options)}`);

    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, options);

        proc.on('close', function (exitCode) {
            if (exitCode === 0) {
                resolve();
            }
            else {
                reject(exitCode);
            }
        });
    });
}

module.exports = { run };
