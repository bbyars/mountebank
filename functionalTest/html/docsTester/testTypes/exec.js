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

// function ensureOSCompatibility (command) {
//    // On CircleCI image, netcat requires the -q1 parameter to end after receiving stdin
//    // This feels ugly to do the replacement here, but I prefer it over doing the replacement
//    // directly in the views because I want people to be able to copy the command from the
//    // public site and run on their machines, and the variant without the -q is the most portable
//    // even though the public site is hosted on linux
//    if (require('os').platform() === 'linux') {
//        return command.replace('| nc ', '| nc -q1 ');
//    }
//    else {
//        // Mac netcat doesn't support the -q parameter
//        return command;
//    }
// }

function runStep (step) {
    var deferred = Q.defer(),
        filename = 'test-' + nextTestId;

    fs.writeFileSync(filename, step.requestText, { mode: 484 /* 0744 */});
    nextTestId += 1;

    execute('sh ./' + filename).done(function (stdout) {
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
