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

        it('should not be valid if below zero', function () {
            var errors = behaviors.validate({ wait: -1 });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"wait" value must be an integer greater than or equal to 0',
                source: { wait: -1 }
            }]);
        });

        it('should be valid if a string is passed in for the function', function () {
            var errors = behaviors.validate({ wait: 'function () {}' });
            assert.deepEqual(errors, []);
        });

        it('should not be valid if a boolean is passed in', function () {
            var errors = behaviors.validate({ wait: true });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"wait" value must be an integer greater than or equal to 0',
                source: { wait: true }
            }]);
        });
    });

    describe('#repeat', function () {
        it('should not be valid if it is less than 0', function () {
            var errors = behaviors.validate({ repeat: 0 });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"repeat" value must be an integer greater than 0',
                source: { repeat: 0 }
            }]);
        });

        it('should not be valid if boolean', function () {
            var errors = behaviors.validate({ repeat: true });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"repeat" value must be an integer greater than 0',
                source: { repeat: true }
            }]);
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

        it('should not be valid if not a string', function () {
            var errors = behaviors.validate({ shellTransform: {} });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"shellTransform" value must be a string of the path to a command line application',
                source: { shellTransform: {} }
            }]);
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

        it('should not be valid if not a string', function () {
            var errors = behaviors.validate({ decorate: {} });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"decorate" value must be a string representing a JavaScript function',
                source: { decorate: {} }
            }]);
        });
    });

    describe('#copy', function () {
        promiseIt('should support copying regex match from request', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from request with ignoreCase', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'MOUNT\\w+$',
                            options: { ignoreCase: true }
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from request with multiline', function () {
            var request = { data: 'First line\nMy name is mountebank\nThird line' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'mount\\w+$',
                            options: { multiline: true }
                        }
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
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'Mi nombre es (\\w+)$'
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should support copying regex match into object response field', function () {
            var request = { data: 'My name is mountebank' },
                response = { outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { outer: { inner: 'Hello, mountebank' } });
            });
        });

        promiseIt('should support copying regex match into all response fields', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: '${you}', outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'mountebank', outer: { inner: 'Hello, mountebank' } });
            });
        });

        promiseIt('should support copying regex match from object request field', function () {
            var request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: { data: 'name' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from object request field ignoring case of key', function () {
            var request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: { data: 'NAME' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex indexed groups from request', function () {
            var request = { name: 'The date is 2016-12-29' },
                response = { data: 'Year ${DATE}[1], Month ${DATE}[2], Day ${DATE}[3]: ${DATE}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'name',
                        into: '${DATE}',
                        using: { method: 'regex', selector: '(\\d{4})-(\\d{2})-(\\d{2})' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Year 2016, Month 12, Day 29: 2016-12-29' });
            });
        });

        promiseIt('should default to first value in multi-valued request field', function () {
            var request = { data: ['first', 'second', 'third'] },
                response = { data: 'Grabbed the ${num}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${num}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Grabbed the first' });
            });
        });

        promiseIt('should support copying xpath match into response', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should ignore xpath if does not match', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should ignore xpath if field is not xml', function () {
            var request = { field: '' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
                logger.warn.assertLogged('[xmldom error]\tinvalid doc source\n@#[line:undefined,col:undefined] (source: "")');
            });
        });

        promiseIt('should support replacing token with xml attribute', function () {
            var request = { field: '<doc><tool name="mountebank">Service virtualization</tool></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//tool/@name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support replacing token with xml direct text', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name/text()' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support replacing token with namespaced xml field', function () {
            var request = { field: '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: {
                            method: 'xpath',
                            selector: '//mb:name',
                            ns: { mb: 'http://example.com/mb' }
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support multiple indexed xpath matches into response', function () {
            var request = { field: '<doc><num>3</num><num>2</num><num>1</num></doc>' },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'xpath', selector: '//num' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: '3, 2, 1' });
            });
        });

        promiseIt('should ignore jsonpath selector if field is not json', function () {
            var request = { field: 'mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
                logger.warn.assertLogged('Cannot parse as JSON: "mountebank"');
            });
        });

        promiseIt('should support replacing token with jsonpath selector', function () {
            var request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should not replace token if jsonpath selector does not match', function () {
            var request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should support replacing multiple indexed tokens with jsonpath selector', function () {
            var request = { field: JSON.stringify({ numbers: [{ key: 3 }, { key: 2 }, { key: 1 }] }) },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'jsonpath', selector: '$..key' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: '3, 2, 1' });
            });
        });

        it('should not be valid if not an array', function () {
            var errors = behaviors.validate({
                copy: {}
            });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"copy" behavior must be an array',
                source: { copy: {} }
            }]);
        });

        it('should not be valid if missing "from" field', function () {
            var config = { into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field required',
                source: config
            }]);
        });

        it('should not be valid if "from" field is not a string or an object', function () {
            var config = { from: 0, into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must be a string or an object, representing the request field to copy from',
                source: config
            }]);
        });

        it('should not be valid if "from" object field has zero keys', function () {
            var config = {
                    from: {},
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field can only have one key per object',
                source: config
            }]);
        });

        it('should not be valid if "from" object field has multiple keys', function () {
            var config = {
                    from: { first: 'first', second: 'second' },
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field can only have one key per object',
                source: config
            }]);
        });

        it('should not be valid if missing "into" field', function () {
            var config = { from: 'field', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field required',
                source: config
            }]);
        });

        it('should not be valid if "into" field is not a string', function () {
            var config = { from: 'field', into: 0, using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field must be a string, representing the token to replace in response fields',
                source: config
            }]);
        });

        it('should not be valid if missing "using" field', function () {
            var config = { from: 'field', into: 'TOKEN' },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using" field required',
                source: config
            }]);
        });

        it('should not be valid if "using.method" field is missing', function () {
            var config = { from: 'field', into: 'TOKEN', using: { selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field required',
                source: config
            }]);
        });

        it('should not be valid if "using.method" field is not supported', function () {
            var config = { from: 'field', into: 'TOKEN', using: { method: 'INVALID', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field must be one of [regex, xpath, jsonpath]',
                source: config
            }]);
        });

        it('should not be valid if "using.selector" field is missing', function () {
            var config = { from: 'field', into: 'TOKEN', using: { method: 'regex' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.selector" field required',
                source: config
            }]);
        });
    });
});
