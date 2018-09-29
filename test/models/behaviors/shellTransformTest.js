'use strict';

const assert = require('assert'),
    util = require('util'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', () => {
    describe('#shellTransform', () => {
        promiseIt('should not execute during dry run', () => {
            const request = { isDryRun: true },
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                config = { shellTransform: ['echo Should not reach here'] };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'ORIGINAL' });
            });
        });

        promiseIt('should return output of command', () => {
            const request = {},
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log(JSON.stringify({ data: 'CHANGED' }));
                },
                config = { shellTransform: ['node shellTransformTest.js'] };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'CHANGED' });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should pass request and response to shell command', () => {
            const request = { data: 'FROM REQUEST' },
                response = { data: 'UNCHANGED', requestData: '' },
                logger = Logger.create(),
                shellFn = function exec () {
                    // The replace of quotes only matters on Windows due to shell differences
                    const shellRequest = JSON.parse(process.argv[2].replace("'", '')),
                        shellResponse = JSON.parse(process.argv[3].replace("'", ''));

                    shellResponse.requestData = shellRequest.data;
                    console.log(JSON.stringify(shellResponse));
                },
                config = { shellTransform: ['node shellTransformTest.js'] };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject promise if file does not exist', () => {
            const request = {},
                response = {},
                logger = Logger.create(),
                config = { shellTransform: ['fileDoesNotExist'] };

            return behaviors.execute(request, response, config, logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                // Error message is OS-dependent
                assert.ok(error.indexOf('fileDoesNotExist') >= 0, error);
            });
        });

        promiseIt('should reject if command returned non-zero status code', () => {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.error('BOOM!!!');
                    process.exit(1);
                },
                config = { shellTransform: ['node shellTransformTest.js'] };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.ok(error.indexOf('Command failed') >= 0, error);
                assert.ok(error.indexOf('BOOM!!!') >= 0, error);
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject if command does not return valid JSON', () => {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('This is not JSON');
                },
                config = { shellTransform: ['node shellTransformTest.js'] };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, config, logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, function (error) {
                assert.ok(error.indexOf('Shell command returned invalid JSON') >= 0, error);
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        it('should not be valid if not an array', () => {
            const errors = behaviors.validate({ shellTransform: 'string' });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'shellTransform behavior "shellTransform" field must be an array',
                source: { shellTransform: 'string' }
            }]);
        });
    });
});
