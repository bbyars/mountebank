'use strict';

function isOutOfProcessImposter (protocol) {
    const fs = require('fs');

    if (fs.existsSync('protocols.json')) {
        const protocols = require(process.cwd() + '/protocols.json');
        return Object.keys(protocols).indexOf(protocol) >= 0;
    }
    else {
        return false;
    }
}

function isInProcessImposter (protocol) {
    return !isOutOfProcessImposter(protocol);
}

module.exports = { isOutOfProcessImposter, isInProcessImposter };
