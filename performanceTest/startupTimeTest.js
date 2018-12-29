'use strict';

const Q = require('q'),
    assert = require('assert'),
    api = require('./../functionalTest/api/api').create(),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    mb = require('../functionalTest/mb').create(api.port + 1);

describe('mb', function () {
    this.timeout(450000);

    // https://github.com/bbyars/mountebank/issues/192
    // Over time, mountebank became slower to start because all the require statements
    // were at the top of each module, recursively loading all dependencies on startup.
    // The solution is to localize the require calls.
    promiseIt('should consistently start up quickly no matter how many packages are installed', function () {
        const RUNS = 500,
            start = new Date();
        let restartSequence = Q(true);

        for (let i = 0; i < RUNS; i += 1) {
            restartSequence = restartSequence.then(() => {
                process.stdout.write('.');
                return mb.restart();
            });
        }

        return restartSequence.then(() => {
            const milliseconds = new Date() - start,
                seconds = milliseconds / 1000,
                millisecondsPer = milliseconds / RUNS;
            console.log(`Took ${seconds} seconds, averaging ${millisecondsPer} ms per restart`);
            assert.ok(millisecondsPer < 800, `Averaged ${millisecondsPer}; should be under 500 (added buffer for CI determinism)`);
        }).finally(() => mb.stop());
    });
});
