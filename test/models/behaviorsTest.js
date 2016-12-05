'use strict';

var assert = require('assert'),
    util = require('util'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
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
                command = 'node shellTransformTest.js',
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('%s', JSON.stringify({ data: 'CHANGED' }));
                };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

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
                    var shellRequest = JSON.parse(process.argv[2]),
                        shellResponse = JSON.parse(process.argv[3]);

                    shellResponse.requestData = shellRequest.data;
                    console.log(JSON.stringify(shellResponse));
                };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function (response) {
                assert.deepEqual(response, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject promise if file does not exist', function () {
            var request = {},
                responsePromise = Q({}),
                command = 'fileDoesNotExist',
                logger = Logger.create();

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function () {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.ok(error.indexOf('command not found') >= 0);
            });
        });

        promiseIt('should reject if command returned non-zero status code', function () {
            var request = {},
                responsePromise = Q({}),
                command = 'node shellTransformTest.js',
                logger = Logger.create(),
                shellFn = function exec () {
                    console.error('BOOM!!!');
                    process.exit(1);
                };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function () {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.ok(error.indexOf('Command failed') >= 0);
                assert.ok(error.indexOf('BOOM!!!') >= 0);
            });
        });

        promiseIt('should reject if command does not return valid JSON', function () {
            var request = {},
                responsePromise = Q({}),
                command = 'node shellTransformTest.js',
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('This is not JSON');
                };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.shellTransform(request, responsePromise, command, logger).then(function () {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.ok(error.indexOf('Shell command returned invalid JSON') >= 0);
            });
        });
    });
});
