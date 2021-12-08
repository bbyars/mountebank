'use strict';

const exec = require('child_process').exec,
    fs = require('fs-extra');
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
    return command.replace('| nc ', '| npx nc -q1 ');
}

async function runStep (step) {
    const filename = `test-${nextTestId}`;

    fs.writeFileSync(filename, usePortableNetcat(step.requestText), { mode: 484 /* 0744 */ });
    nextTestId += 1;

    try {
        return await execute(`sh ./${filename}`);
    }
    catch (reason) {
        console.log(`Error executing following command: ${step.text}`);
        throw reason;
    }
    finally {
        fs.unlinkSync(filename);
    }
}

module.exports = { runStep };
