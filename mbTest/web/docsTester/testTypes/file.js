'use strict';

const fs = require('fs-extra');

function runStep (config) {
    if (config.delete === 'true') {
        fs.unlinkSync(config.filename);
    }
    else {
        fs.writeFileSync(config.filename, config.requestText);
    }
    return Promise.resolve(config);
}

module.exports = { runStep };
