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

function ensureOSCompatibility (command) {
    // On CircleCI image, netcat requires the -q1 parameter to end after receiving stdin
    if (require('os').platform() === 'linux') {
        return command.replace('| nc ', '| nc -q1 ');
    }
    else {
        // Mac netcat doesn't support the -q parameter
        return command;
    }
}

function runStep (step) {
    var deferred = Q.defer(),
        filename = 'test-' + nextTestId;

console.log('========================' + new Date() + '========================');
console.log('writing ' + filename + ':\n' + step.requestText);
    fs.writeFileSync(filename, ensureOSCompatibility(step.requestText), { mode: 484 /* 0744 */});
    nextTestId += 1;

console.log('========================' + new Date() + '========================');
console.log('executing ' + filename);

    execute('sh ./' + filename).done(function (stdout) {
console.log('========================' + new Date() + '========================');
console.log('got result from ' + filename + ': ' + stdout);
        fs.unlinkSync(filename);
        deferred.resolve(stdout);
    }, function (reason) {
        console.log('Error executing following command: ' + step.text);
        deferred.reject(reason);
    });

    return deferred.promise;
}

module.exports = {
    runStep: runStep
};
