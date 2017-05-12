'use strict';

var fs = require('fs'),
    Q = require('q');

// TODO: filename, text
function runStep (step) {
    if (step.text.trim() === '') {
        fs.unlinkSync(step.filename);
    }
    else {
        fs.writeFileSync(step.filename, step.text);
    }
    return Q(step);
}

module.exports = {
    runStep: runStep
};
