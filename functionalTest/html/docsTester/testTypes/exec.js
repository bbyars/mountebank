'use strict';

var exec = require('child_process').exec,
    Q = require('q'),
    fs = require('fs'),
    nextTestId = 1;

function execute (command) {
    var deferred = Q.defer();

    exec(command, function (error, stdout) {
        if (error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

// TODO: text, sets result
function runStep (step) {
    var deferred = Q.defer(),
        filename = 'test-' + nextTestId;

    fs.writeFileSync(filename, step.text, { mode: 484 /* 0744 */});
    nextTestId += 1;

    execute('sh ./' + filename).done(function (stdout) {
        step.result = stdout;
        fs.unlinkSync(filename);
        deferred.resolve(step);
    }, function (reason) {
        console.log('Error executing following command: ' + step.text);
        deferred.reject(reason);
    });

    return deferred.promise;
}

module.exports = {
    runStep: runStep
};
