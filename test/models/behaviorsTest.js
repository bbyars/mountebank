'use strict';

var assert = require('assert'),
    util = require('util'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    behaviors = require('../../src/models/behaviors'),
    Logger = require('../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', function () {
    describe('#shellTransform', function () {
        promiseIt('should not execute during dry run', function () {
            var request = { isDryRun: true },
                responsePromise = Q({ data: 'ORIGINAL' }),
                command = 'echo Should not reach here',
                logger = Logger.create();

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function (response) {
                assert.deepEqual(response, { data: 'ORIGINAL' });
            });
        });

        promiseIt('should return output of command', function () {
            var request = {},
                responsePromise = Q({ data: 'ORIGINAL' }),
                changedJSON = { data: 'CHANGED' },
                command = 'node shellTransformTest.js',
                logger = Logger.create();

            fs.writeFileSync('shellTransformTest.js', util.format("console.log('%s');", JSON.stringify(changedJSON)));

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function (response) {
                assert.deepEqual(response, { data: 'CHANGED' });
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should pass request and response to shell command', function () {
            var request = { data: 'FROM REQUEST' },
                responsePromise = Q({ data: 'UNCHANGED', requestData: '' }),
                command = 'node shellTransformTest.js',
                logger = Logger.create(),
                shellFn = function exec () {
                    var request = JSON.parse(process.argv[2]),
                        response = JSON.parse(process.argv[3]);

                    response.requestData = request.data;
                    console.log(JSON.stringify(response));
                };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function (response) {
                assert.deepEqual(response, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });
    });
});
