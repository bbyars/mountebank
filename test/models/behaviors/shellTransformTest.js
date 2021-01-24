'use strict';

const assert = require('assert'),
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', function () {
    describe('#shellTransform', function () {
        afterEach(function () {
            if (fs.existsSync('shellTransformTest.js')) {
                fs.unlinkSync('shellTransformTest.js');
            }
        });

        it('should not execute during dry run', async function () {
            const request = { isDryRun: true },
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                config = { shellTransform: 'echo Should not reach here' },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'ORIGINAL' });
        });

        it('should return output of command', async function () {
            const request = {},
                response = { data: 'ORIGINAL' },
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log(JSON.stringify({ data: 'CHANGED' }));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'CHANGED' });
        });

        it('should pass request and response to shell command', async function () {
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

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'UNCHANGED', requestData: 'FROM REQUEST' });
        });

        it('should reject promise if file does not exist', async function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                config = { shellTransform: 'fileDoesNotExist' };

            try {
                await behaviors.execute(request, response, [config], logger);
                assert.fail('Promise resolved, should have been rejected');
            }
            catch (error) {
                // Error message is OS-dependent
                assert.ok(error.indexOf('fileDoesNotExist') >= 0, error);
            }
        });

        it('should reject if command returned non-zero status code', async function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.error('BOOM!!!');
                    process.exit(1); // eslint-disable-line no-process-exit
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

            try {
                await behaviors.execute(request, response, [config], logger);
                assert.fail('Promise resolved, should have been rejected');
            }
            catch (error) {
                assert.ok(error.indexOf('Command failed') >= 0, error);
                assert.ok(error.indexOf('BOOM!!!') >= 0, error);
            }
        });

        it('should reject if command does not return valid JSON', async function () {
            const request = {},
                response = {},
                logger = Logger.create(),
                shellFn = function exec () {
                    console.log('This is not JSON');
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

            try {
                await behaviors.execute(request, response, [config], logger);
                assert.fail('Promise resolved, should have been rejected');
            }
            catch (error) {
                assert.ok(error.indexOf('Shell command returned invalid JSON') >= 0, error);
            }
        });

        it('should not be valid if not a string', function () {
            const errors = behaviors.validate([{ shellTransform: 100 }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'shellTransform behavior "shellTransform" field must be a string, representing the path to a command line application',
                source: { shellTransform: 100 }
            }]);
        });

        it('should correctly shell quote inner quotes (issue #419)', async function () {
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

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { requestData: '{"fastSearch": "abctef abc def"}' });
        });

        it('should allow large files (issue #518)', async function () {
            const request = { key: 'value' },
                response = { field: 0 },
                logger = Logger.create(),
                shellFn = function exec () {
                    const shellResponse = JSON.parse(process.env.MB_RESPONSE);

                    shellResponse.added = new Array(1024 * 1024 * 2).join('x');
                    console.log(JSON.stringify(shellResponse));
                },
                config = { shellTransform: 'node shellTransformTest.js' };

            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, {
                field: 0,
                added: new Array(1024 * 1024 * 2).join('x')
            });
        });
    });
});
