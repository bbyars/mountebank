'use strict';

const assert = require('assert'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger'),
    fs = require('fs');

describe('behaviors', function () {
    describe('#lookup', function () {
        it('should not be valid if missing "key" field', function () {
            const config = {
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if missing "key.from" field', function () {
            const config = {
                    key: { using: { method: 'regex', selector: '.*' } },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.from" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if missing "key.using" field', function () {
            const config = {
                    key: { from: 'data' },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.using" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "key.using" field is not an object', function () {
            const config = {
                    key: { from: 'data', using: 'regex' },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.using" field must be an object',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "key.using.method" field is missing', function () {
            const config = {
                    key: { from: 'data', using: { selector: '.*' } },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.using.method" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "key.using.method" field is not supported', function () {
            const config = {
                    key: { from: 'data', using: { method: 'INVALID', selector: '.*' } },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.using.method" field must be one of [regex, xpath, jsonpath]',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "key.using.selector" field is missing', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex' } },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "key.using.selector" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if missing "fromDataSource" field', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "fromDataSource" field required',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "fromDataSource" field is not an object', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                    fromDataSource: 'csv',
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "fromDataSource" field must be an object',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "fromDataSource" key is not supported', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                    fromDataSource: { invalid: {} },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "fromDataSource" field must be one of [csv]',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if "fromDataSource" object multiple keys', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                    fromDataSource: { sql: {}, csv: { path: '', keyColumn: '', columnInto: ['key'] } },
                    into: 'TOKEN'
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "fromDataSource" field must have exactly one key',
                source: { lookup: config }
            }]);
        });

        it('should not be valid if missing "into" field', function () {
            const config = {
                    key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                    fromDataSource: { csv: { path: '', keyColumn: '', columnInto: ['key'] } }
                },
                errors = behaviors.validate([{ lookup: config }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'lookup behavior "into" field required',
                source: { lookup: config }
            }]);
        });

        describe('csv', function () {
            before(() => {
                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');
            });

            after(() => {
                fs.unlinkSync('lookupTest.csv');
            });

            promiseIt('should log error and report nothing if file does not exist', function () {
                const request = { data: 'My name is mountebank' },
                    response = { data: 'Hello, ${you}["occupation"]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'data', using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'INVALID.csv', keyColumn: 'name', delimiter: '|' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}["occupation"]' });
                    logger.error.assertLogged('Cannot read INVALID.csv: ');
                });
            });

            promiseIt('should support lookup keyed by regex match from request', function () {
                const request = { data: 'My name is mountebank' },
                    response = { data: 'Hello, ${you}["occupation"]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'data', using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup keyed by regex match from request with ignoreCase', function () {
                const request = { data: 'My name is mountebank' },
                    response = { data: "Hello, ${you}['occupation']" },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: {
                                from: 'data',
                                using: { method: 'regex', selector: 'MOUNT\\w+$', options: { ignoreCase: true } }
                            },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup keyed by regex match from request with multiline', function () {
                const request = { data: 'First line\nMy name is mountebank\nThird line' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: {
                                from: 'data',
                                using: { method: 'regex', selector: 'mount\\w+$', options: { multiline: true } }
                            },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should not replace if regex does not match', function () {
                const request = { data: 'My name is mountebank' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: {
                                from: 'data',
                                using: { method: 'regex', selector: 'Mi nombre es (\\w+)$' }
                            },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                });
            });

            promiseIt('should support lookup replace keyed by regex match into object response field', function () {
                const request = { data: 'My name is mountebank' },
                    response = { outer: { inner: 'Hello, ${you}["occupation"]' } },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'data', using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { outer: { inner: 'Hello, tester' } });
                });
            });

            promiseIt('should support lookup replacement into all response fields', function () {
                const request = { data: 'My name is mountebank' },
                    response = { data: '${you}[location]', outer: { inner: 'Hello, ${you}[occupation]' } },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'data', using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'worldwide', outer: { inner: 'Hello, tester' } });
                });
            });

            promiseIt('should support lookup replacement from object request field', function () {
                const request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: { data: 'name' }, using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup replacement from object request field ignoring case of key', function () {
                const request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: { data: 'NAME' }, using: { method: 'regex', selector: '\\w+$' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup replacement keyed by regex indexed group from request', function () {
                const request = { name: 'My name is mountebank' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: {
                                from: 'name',
                                using: { method: 'regex', selector: 'My name is (\\w+)' },
                                index: 1
                            },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should default to first value in multi-valued request field', function () {
                const request = { data: ['Brandon', 'mountebank', 'Bob Barker'] },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'data', using: { method: 'regex', selector: '\\w+' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
                });
            });

            promiseIt('should support lookup keyed by xpath match into response', function () {
                const request = { field: '<doc><name>mountebank</name></doc>' },
                    response = { data: 'Hello, ${you}["occupation"]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//name' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should ignore xpath if does not match', function () {
                const request = { field: '<doc><name>mountebank</name></doc>' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//title' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                });
            });

            promiseIt('should ignore xpath if field is not xml', function () {
                const request = { field: '' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//title' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                    logger.warn.assertLogged('[xmldom error]\tinvalid doc source\n@#[line:undefined,col:undefined] (source: "")');
                });
            });

            promiseIt('should support lookup keyed by xml attribute', function () {
                const request = { field: '<doc><tool name="mountebank">Service virtualization</tool></doc>' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//tool/@name' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup keyed by xml direct text', function () {
                const request = { field: '<doc><name>mountebank</name></doc>' },
                    response = { data: 'Hello, ${you}["occupation"]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//name/text()' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup keyed by namespaced xml field', function () {
                const request = { field: '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: {
                                from: 'field',
                                using: {
                                    method: 'xpath',
                                    selector: '//mb:name',
                                    ns: { mb: 'http://example.com/mb' }
                                }
                            },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should support lookup keyed by indexed xpath match', function () {
                const request = { field: '<doc><name>Bob Barker</name><name>mountebank</name><name>Brandon</name></doc>' },
                    response = { data: 'Hello ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'xpath', selector: '//name' }, index: 2 },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello mountebank' });
                });
            });

            promiseIt('should ignore jsonpath selector if field is not json', function () {
                const request = { field: 'mountebank' },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}[occupation]'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                    logger.warn.assertLogged('Cannot parse as JSON: "mountebank"');
                });
            });

            promiseIt('should support lookup keyed on jsonpath selector', function () {
                const request = { field: JSON.stringify({ name: 'mountebank' }) },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, tester' });
                });
            });

            promiseIt('should not replace token if jsonpath selector does not match', function () {
                const request = { field: JSON.stringify({ name: 'mountebank' }) },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'jsonpath', selector: '$..title' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                });
            });

            promiseIt('should support lookup keyed on indexed token with jsonpath selector', function () {
                const request = { field: JSON.stringify({
                        people: [{ name: 'mountebank' }, { name: 'Bob Barker' }, { name: 'Brandon' }] }) },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' }, index: 1 },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, The Price Is Right' });
                });
            });

            promiseIt('should not replace if index exceeds options', function () {
                const request = { field: JSON.stringify({
                        people: [{ name: 'mountebank' }, { name: 'Bob Barker' }, { name: 'Brandon' }] }) },
                    response = { data: 'Hello, ${you}[occupation]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' }, index: 10 },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, ${you}[occupation]' });
                });
            });

            promiseIt('should support lookup of value with embedded comma', function () {
                const request = { field: 'The Price Is Right' },
                    response = { data: 'Hello, ${you}[location]' },
                    logger = Logger.create(),
                    config = {
                        lookup: {
                            key: { from: 'field', using: { method: 'regex', selector: '.*' } },
                            fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'occupation' } },
                            into: '${you}'
                        }
                    };

                return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                    assert.deepEqual(actualResponse, { data: 'Hello, Darrington, Washington' });
                });
            });

            it('should not be valid if "fromDataSource.csv" is not an object', function () {
                const config = {
                        key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                        fromDataSource: { csv: '' },
                        into: 'TOKEN'
                    },
                    errors = behaviors.validate([{ lookup: config }]);
                assert.deepEqual(errors, [{
                    code: 'bad data',
                    message: 'lookup behavior "fromDataSource.csv" field must be an object',
                    source: { lookup: config }
                }]);
            });

            it('should not be valid if "fromDataSource.csv.path" missing', function () {
                const config = {
                        key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                        fromDataSource: { csv: { keyColumn: '', columnInto: ['key'] } },
                        into: 'TOKEN'
                    },
                    errors = behaviors.validate([{ lookup: config }]);
                assert.deepEqual(errors, [{
                    code: 'bad data',
                    message: 'lookup behavior "fromDataSource.csv.path" field required',
                    source: { lookup: config }
                }]);
            });

            it('should not be valid if "fromDataSource.csv.path" is not a string', function () {
                const config = {
                        key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                        fromDataSource: { csv: { path: 0, keyColumn: '', columnInto: ['key'] } },
                        into: 'TOKEN'
                    },
                    errors = behaviors.validate([{ lookup: config }]);
                assert.deepEqual(errors, [{
                    code: 'bad data',
                    message: 'lookup behavior "fromDataSource.csv.path" field must be a string, representing the path to the CSV file',
                    source: { lookup: config }
                }]);
            });

            it('should not be valid if "fromDataSource.csv.keyColumn" missing', function () {
                const config = {
                        key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                        fromDataSource: { csv: { path: '', columnInto: ['key'] } },
                        into: 'TOKEN'
                    },
                    errors = behaviors.validate([{ lookup: config }]);
                assert.deepEqual(errors, [{
                    code: 'bad data',
                    message: 'lookup behavior "fromDataSource.csv.keyColumn" field required',
                    source: { lookup: config }
                }]);
            });

            it('should not be valid if "fromDataSource.csv.keyColumn" is not a string', function () {
                const config = {
                        key: { from: 'data', using: { method: 'regex', selector: '.*' } },
                        fromDataSource: { csv: { path: '', keyColumn: 0, columnInto: ['key'] } },
                        into: 'TOKEN'
                    },
                    errors = behaviors.validate([{ lookup: config }]);
                assert.deepEqual(errors, [{
                    code: 'bad data',
                    message: 'lookup behavior "fromDataSource.csv.keyColumn" field must be a string, representing the column header to select against the "key" field',
                    source: { lookup: config }
                }]);
            });

            describe('csv-delimiter', () => {
                before(() => {
                    fs.writeFileSync('lookupDelimiterTest.csv',
                        'name|occupation|location\n' +
                        'mountebank|tester|worldwide\n' +
                        'Brandon|mountebank|Dallas\n' +
                        'Bob Barker|"The Price Is Right"|"Darrington, Washington"\n' +
                        'jeanpaulct|developer|Peru');
                });

                after(() => {
                    fs.unlinkSync('lookupDelimiterTest.csv');
                });

                promiseIt('should not be lookup if "CSV headers" does not contains "keyColumn"', () => {
                    const request = { field: JSON.stringify({ name: 'jeanpaulct' }) },
                        response = { data: 'Hello from ${you}[location]' },
                        logger = Logger.create(),
                        config = {
                            lookup: {
                                key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' } },
                                fromDataSource: { csv: { path: 'lookupDelimiterTest.csv', keyColumn: 'name' } },
                                into: '${you}'
                            }
                        };

                    return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                        assert.deepEqual(actualResponse, { data: 'Hello from ${you}[location]' });
                        logger.error.assertLogged('CSV headers "name|occupation|location" with delimiter "," does not contain keyColumn:"name"');
                    });
                });

                promiseIt('should be lookup with custom delimiter', () => {
                    const request = { field: JSON.stringify({ name: 'jeanpaulct' }) },
                        response = { data: 'Regards from ${you}[location]' },
                        logger = Logger.create(),
                        config = {
                            lookup: {
                                key: { from: 'field', using: { method: 'jsonpath', selector: '$..name' } },
                                fromDataSource: { csv: { path: 'lookupDelimiterTest.csv', keyColumn: 'name', delimiter: '|' } },
                                into: '${you}'
                            }
                        };

                    return behaviors.execute(request, response, [config], logger).then(actualResponse => {
                        assert.deepEqual(actualResponse, { data: 'Regards from Peru' });
                    });
                });

            });
        });
    });
});
