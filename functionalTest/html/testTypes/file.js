'use strict';

var fs = require('fs'),
    Q = require('q');

function runStep (step) {
    if (step.execute.trim() === '') {
        fs.unlinkSync(step.filename);
    }
    else {
        fs.writeFileSync(step.filename, step.execute);
    }
    return Q(step);
}

module.exports = {
    runStep: runStep
};
