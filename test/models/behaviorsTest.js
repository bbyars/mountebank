'use strict';

var assert = require('assert'),
    util = require('util'),
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
                start = new Date(),
                config = { wait: 1000 };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time < 50, 'Took ' + time + ' milliseconds');
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should wait specified number of milliseconds', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date(),
                config = { wait: 100 };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
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
                start = new Date(),
                config = { wait: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); },
                config = { wait: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
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
                start = new Date(),
                config = { wait: '100' };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });
    });

    describe('#shellTransform', function () {
        promiseIt('should not execute during dry run', function () {
            var request = { isDryRun: true },
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                config = { shellTransform: 'echo Should not reach here' };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'ORIGINAL' });
            });
        });

        promiseIt('should return output of command', function () {
            var request = {},
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log(JSON.stringify({ data: 'CHANGED' }));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'CHANGED' });
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should pass request and response to shell command', function () {
            var request = { data: 'FROM REQUEST' },
                response = { data: 'UNCHANGED', requestData: '' },
                logger = Logger.create(),
                shellFn = function exec () {
                    // The replace of quotes only matters on Windows due to shell differences
                    var shellRequest = JSON.parse(process.argv[2].replace("'", '')),
                        shellResponse = JSON.parse(process.argv[3].replace("'", ''));

                    shellResponse.requestData = shellRequest.data;
                    console.log(JSON.stringify(shellResponse));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject promise if file does not exist', function () {
            var request = {},
                response = {},
                logger = Logger.create(),
                config = { shellTransform: 'fileDoesNotExist' };

            return behaviors.execute(request, response, config, logger).then(function () {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                // Error message is OS-dependent
                assert.ok(error.indexOf('fileDoesNotExist') >= 0, error);
            });
        });

        promiseIt('should reject if command returned non-zero status code', function () {
            var request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.error('BOOM!!!');
                    process.exit(1);
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function () {
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
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('This is not JSON');
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function () {
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
                fn = function (req, responseToDecorate) { responseToDecorate.key = 'CHANGED'; },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { key: 'CHANGED' });
            });
        });

        promiseIt('should allow returning response', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function () { return { newKey: 'NEW-VALUE' }; },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { newKey: 'NEW-VALUE' });
            });
        });

        promiseIt('should allow logging in the decoration function', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function (req, resp, log) { log.info('test entry'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
                logger.info.assertLogged('test entry');
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid decorator injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });
    });

    describe('#copy', function () {
        promiseIt('should not execute during dry run', function () {
            var request = { isDryRun: true, data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        regex: { pattern: 'My name is (\\w+)$' },
                        into: '${you}'
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should support copying regex group from request', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        regex: { pattern: 'My name is (\\w+)$' },
                        into: '${you}'
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex group from request with ignoreCase', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        regex: { pattern: 'MY NAME IS (\\w+)$', ignoreCase: true },
                        into: '${you}'
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex group from request with multiine', function () {
            var request = { data: 'First line\nMy name is mountebank\nThird line' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        regex: { pattern: '^My name is (\\w+)$', multiline: true },
                        into: '${you}'
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should not replace if regex does not match', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        regex: { pattern: 'Mi nombre es (\\w+)$' },
                        into: '${you}'
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });
    });
});
