'use strict';

const fs = require('fs'),
    thisPackage = JSON.parse(fs.readFileSync('./package.json')),
    current = thisPackage.version;

async function getVersion () {
    const buildNumber = process.env.CIRCLE_BUILD_NUM;

    if (typeof buildNumber === 'undefined') {
        // Leave as is if not in CI
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
