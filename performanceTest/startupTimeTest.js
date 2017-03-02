'use strict';

var Q = require('q'),
    assert = require('assert'),
    api = require('./../functionalTest/api/api'),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    mb = require('../functionalTest/mb').create(api.port + 1);

describe('mb', function () {
    this.timeout(450000);

    // https://github.com/bbyars/mountebank/issues/192
    // Over time, mountebank became slower to start because all the require statements
    // were at the top of each module, recursively loading all dependencies on startup.
    // The solution is to localize the require calls.
    promiseIt('should consistently start up quickly no matter how many packages are installed', function () {
        var RUNS = 500,
            restartSequence = Q(true),
            start = new Date();

        for (var i = 0; i < RUNS; i += 1) {
            restartSequence = restartSequence.then(function () {
                process.stdout.write('.');
                return mb.restart();
            });
        }

        return restartSequence.then(function () {
            var milliseconds = new Date() - start,
                seconds = milliseconds / 1000,
                millisecondsPer = milliseconds / RUNS;
            console.log('Took ' + seconds + ' seconds, averaging ' + millisecondsPer + ' ms per restart');
            assert.ok(millisecondsPer < 650);
        }).finally(function () {
            return mb.stop();
        });
    });
});
