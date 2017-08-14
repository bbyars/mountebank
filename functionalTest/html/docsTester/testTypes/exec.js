'use strict';

var exec = require('child_process').exec,
    Q = require('q'),
    fs = require('fs'),
    nextTestId = 1;

function execute (command) {
    var deferred = Q.defer();

    console.log('*************');
    console.log(command);
    console.log('*************');
    exec(command, function (error, stdout) {
        if (error) {
            console.log('XXXXXXXXXXXXX');
            console.log(command);
            console.log(error);
            console.log('XXXXXXXXXXXXX');
            deferred.reject(error);
        }
        else {
            console.log('=============');
            console.log(command);
            console.log(stdout);
            console.log('=============');
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

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
