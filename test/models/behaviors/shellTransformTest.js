'use strict';

const assert = require('assert'),
    util = require('util'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', function () {
    describe('#shellTransform', function () {
        promiseIt('should not execute during dry run', function () {
            const request = { isDryRun: true },
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                config = { shellTransform: 'echo Should not reach here' };

            return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                assert.deepEqual(actualResponse, { data: 'ORIGINAL' });
            });
        });

        promiseIt('should return output of command', function () {
            const request = {},
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log(JSON.stringify({ data: 'CHANGED' }));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                assert.deepEqual(actualResponse, { data: 'CHANGED' });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should pass request and response to shell command', function () {
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
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                assert.deepEqual(actualResponse, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject promise if file does not exist', function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                config = { shellTransform: 'fileDoesNotExist' };

            return behaviors.execute(request, response, [config], logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, error => {
                // Error message is OS-dependent
                assert.ok(error.indexOf('fileDoesNotExist') >= 0, error);
            });
        });

        promiseIt('should reject if command returned non-zero status code', function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.error('BOOM!!!');
                    process.exit(1);
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, error => {
                assert.ok(error.indexOf('Command failed') >= 0, error);
                assert.ok(error.indexOf('BOOM!!!') >= 0, error);
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should reject if command does not return valid JSON', function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('This is not JSON');
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(() => {
                assert.fail('Promise resolved, should have been rejected');
            }, error => {
                assert.ok(error.indexOf('Shell command returned invalid JSON') >= 0, error);
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        it('should not be valid if not a string', function () {
            const errors = behaviors.validate([{ shellTransform: 100 }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'shellTransform behavior "shellTransform" field must be a string, representing the path to a command line application',
                source: { shellTransform: 100 }
            }]);
        });

        promiseIt('should correctly shell quote inner quotes (issue #419)', function () {
            const request = { body: '{"fastSearch": "abctef abc def"}' },
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    const shellRequest = JSON.parse(process.env.MB_REQUEST),
                        shellResponse = JSON.parse(process.env.MB_RESPONSE);

                    shellResponse.requestData = shellRequest.body;
                    console.log(JSON.stringify(shellResponse));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                assert.deepEqual(actualResponse, { requestData: '{"fastSearch": "abctef abc def"}' });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });

        promiseIt('should allow large files (issue #518)', function () {
            const request = { key: 'value' },
                response = { field: 0 },
                logger = Logger.create(),
                shellFn = function exec () {
                    const shellResponse = JSON.parse(process.env.MB_RESPONSE);

                    shellResponse.added = new Array(1024 * 1024 * 2).join('x');
                    console.log(JSON.stringify(shellResponse));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                assert.deepEqual(actualResponse, {
                    field: 0,
                    added: new Array(1024 * 1024 * 2).join('x')
                });
            }).finally(() => {
                fs.unlinkSync('shellTransformTest.js');
            });
        });
    });
});
