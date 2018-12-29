'use strict';

const fs = require('fs'),
    Q = require('q');

function runStep (config) {
    if (config.delete === 'true') {
        fs.unlinkSync(config.filename);
    }
    else {
        fs.writeFileSync(config.filename, config.requestText);
    }
    return Q(config);
}

module.exports = { runStep };
