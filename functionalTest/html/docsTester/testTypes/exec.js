'use strict';

const exec = require('child_process').exec,
    Q = require('q'),
    fs = require('fs'),
    path = require('path');
let nextTestId = 1;

const execute = command => {
    const deferred = Q.defer();

    exec(command, (error, stdout) => {
        if (error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
};

const usePortableNetcat = command => {
    // On CircleCI image, netcat requires the -q1 parameter to end after receiving stdin.
    // Faster machines don't need it.
    // I could not find a centos version of netcat that has the -q parameter, nor does
    // the Mac version have the -q parameter. The -w1 parameter, which is cross-OS, did not
    // work. The only solution I found was to use the node port of netcat and use it :(
    // This feels ugly to do the replacement here, but I prefer it over doing the replacement
    // directly in the views because I want people to be able to copy the command from the
    // public site and run on their machines, and the variant without the -q is the most portable
    const netcatPath = path.join(__dirname, '../../../../node_modules/.bin/nc');
    return command.replace('| nc ', `| ${netcatPath} -q1 `);
};

const runStep = step => {
    const deferred = Q.defer(),
        filename = `test-${nextTestId}`;

    fs.writeFileSync(filename, usePortableNetcat(step.requestText), { mode: 484 /* 0744 */});
    nextTestId += 1;

    execute(`sh ./${filename}`).done(stdout => {
        fs.unlinkSync(filename);
        deferred.resolve(stdout);
    }, reason => {
        console.log(`Error executing following command: ${step.text}`);
        deferred.reject(reason);
    });

    return deferred.promise;
};

module.exports = { runStep };
