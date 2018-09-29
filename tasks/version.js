'use strict';

const fs = require('fs'),
    path = require('path');

function runningLocally () {
    return fs.existsSync(path.join(__dirname, '../package.json'));
}

function getVersion () {
    if (process.env.MB_VERSION) {
        return process.env.MB_VERSION;
    }

    if (runningLocally()) {
        return require('../package.json').version;
    }
    else {
        // No local checkout on CircleCI packaging jobs
        return require('../dist/mountebank/package.json').version;
    }
}

module.exports = {
    getVersion: getVersion
};
