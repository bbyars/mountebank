'use strict';

var Q = require('q'),
    assert = require('assert'),
    api = require('./../functionalTest/api/api'),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    mb = require('../functionalTest/mb').create(api.port + 1);

describe('mb', function () {
    this.timeout(300000);

    describe('when starting up', function () {
        promiseIt('should stay below threshold no matter how many packages are installed', function () {
            var RUNS = 100,
                restartSequence = Q(true),
                start = new Date();

            for (var i = 0; i < RUNS; i += 1) {
                restartSequence = restartSequence.then(function () {
                    return mb.restart();
                });
            }

            return restartSequence.then(function () {
                var milliseconds = new Date() - start,
                    seconds = milliseconds / 1000,
                    millisecondsPer = milliseconds / RUNS;
                console.log('Took ' + seconds + ' seconds, averaging ' + millisecondsPer + ' ms per restart');
                assert.ok(millisecondsPer < 1000);
            }).finally(function () {
                return mb.stop();
            });
        });
    });
});
