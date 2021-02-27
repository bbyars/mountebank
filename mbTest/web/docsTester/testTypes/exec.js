'use strict';

const exec = require('child_process').exec,
    fs = require('fs-extra'),
    path = require('path');
let nextTestId = 1;

function execute (command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(stdout);
            }
        });
    });
}

function usePortableNetcat (command) {
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
}

async function runStep (step) {
    const filename = `test-${nextTestId}`;

    fs.writeFileSync(filename, usePortableNetcat(step.requestText), { mode: 484 /* 0744 */ });
    nextTestId += 1;

    try {
        const stdout = await execute(`sh ./${filename}`);
        fs.unlinkSync(filename);
        return stdout;
    }
    catch (reason) {
        console.log(`Error executing following command: ${step.text}`);
        throw reason;
    }
}

module.exports = { runStep };
