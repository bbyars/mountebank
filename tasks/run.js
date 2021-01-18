'use strict';

const spawn = require('child_process').spawn,
    os = require('os');

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

async function run (command, args, options) {
    let npmFailure = false, proc;

    if (isWindows()) {
        // spawn on Windows requires an exe
        args.unshift(command);
        args.unshift('/c');
        command = 'cmd.exe';
    }

    return new Promise((resolve, reject) => {
        proc = spawn(command, args, options);

        proc.stdout.on('data', function (data) {
            console.log(data.toString('utf8').trim());
        });

        proc.stderr.on('data', function (data) {
            console.error(data.toString('utf8').trim());
            if (data.toString('utf8').indexOf('npm ERR!') >= 0) {
                // Hack; dpl returns 0 exit code on npm publish failure
                npmFailure = true;
            }
        });

        proc.on('close', function (exitCode) {
            if (exitCode === 0 && !npmFailure) {
                resolve();
            }
            else {
                reject(npmFailure ? 1 : exitCode);
            }
        });
    });
}

module.exports = { run };
