'use strict';

const fs = require('fs-extra'),
    thisPackage = JSON.parse(fs.readFileSync('./package.json')),
    current = thisPackage.version,
    exec = require('child_process').exec;

async function isReleaseVersion () {
    return new Promise(resolve => {
        exec('git describe --tags --exact-match', (error, stdout) => {
            if (error) {
                resolve(false);
            }
            else {
                const releasePattern = /v\d+\.\d+\.\d+/;
                resolve(releasePattern.test(stdout.trim()));
            }
        });
    });
}

async function getVersion () {
    const isRelease = await isReleaseVersion(),
        buildNumber = process.env.CIRCLE_BUILD_NUM,
        passedVersion = process.env.MB_VERSION;

    if (typeof passedVersion !== 'undefined') {
        // Used for passing the version between CI providers (e.g. CircleCI -> Travis)
        return passedVersion;
    }
    else if (isRelease || typeof buildNumber === 'undefined') {
        // Leave as is if releasing or not in CI
        return current;
    }
    else {
        return `${current}-beta.${buildNumber}`;
    }
}

getVersion().then(next => {
    if (next !== current) {
        thisPackage.version = next;
        fs.writeFileSync('./package.json', JSON.stringify(thisPackage, null, 2) + '\n');
    }
});
