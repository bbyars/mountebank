'use strict';

var assert = require('assert'),
    util = require('util'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    behaviors = require('../../src/models/behaviors'),
    Logger = require('../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', function () {
    describe('#wait', function () {
        promiseIt('should not execute during dry run', function () {
            var request = { isDryRun: true },
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date();

            return behaviors.wait(request, response, Q(response), 1000, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time < 50, 'Took ' + time + ' milliseconds');
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should wait specified number of milliseconds', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date();

            return behaviors.wait(request, response, Q(response), 100, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should allow function to specify latency', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { return 100; },
                start = new Date();

            return behaviors.wait(request, response, Q(response), fn.toString(), logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); };

            return behaviors.wait(request, response, Q(response), fn.toString(), logger).then(function () {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid wait injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });

        promiseIt('should treat a string as milliseconds if it can be parsed as a number', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date();

            return behaviors.wait(request, response, Q(response), '100', logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });
    });

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
                    // The replace of quotes only matters on Windows due to shell differences
                    var shellRequest = JSON.parse(process.argv[2].replace("'", '')),
                        shellResponse = JSON.parse(process.argv[3].replace("'", ''));

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
                // Error message is OS-dependent
                assert.ok(error.indexOf('fileDoesNotExist') >= 0, error);
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
                assert.ok(error.indexOf('Command failed') >= 0, error);
                assert.ok(error.indexOf('BOOM!!!') >= 0, error);
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
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
                assert.ok(error.indexOf('Shell command returned invalid JSON') >= 0, error);
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });
    });

    describe('#decorate', function () {
        promiseIt('should allow changing the response directly', function () {
            var request = {},
                response = { key: 'ORIGINAL' },
                logger = Logger.create(),
                fn = function (req, responseToDecorate) { responseToDecorate.key = 'CHANGED'; };

            return behaviors.decorate(request, Q(response), fn.toString(), logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { key: 'CHANGED' });
            });
        });

        promiseIt('should allow returning response', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function () { return { newKey: 'NEW-VALUE' }; };

            return behaviors.decorate(request, Q(response), fn.toString(), logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { newKey: 'NEW-VALUE' });
            });
        });

        promiseIt('should allow logging in the decoration function', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function (req, resp, log) { log.info('test entry'); };

            return behaviors.decorate(request, Q(response), fn.toString(), logger).then(function () {
                logger.info.assertLogged('test entry');
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); };

            return behaviors.decorate(request, Q(response), fn.toString(), logger).then(function () {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid decorator injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });
    });
});
