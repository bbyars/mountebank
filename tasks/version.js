'use strict';

function getVersion () {
    if (process.env.MB_VERSION) {
        return process.env.MB_VERSION;
    }

    return require('../package.json').version;
}

module.exports = { getVersion };
