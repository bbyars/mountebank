'use strict';

const assert = require('assert'),
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#copy', function () {
        it('should support copying regex match from request', async function () {
            const request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support copying regex match from request with ignoreCase', async function () {
            const request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'MOUNT\\w+$',
                            options: { ignoreCase: true }
                        }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support copying regex match from request with multiline', async function () {
            const request = { data: 'First line\nMy name is mountebank\nThird line' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'mount\\w+$',
                            options: { multiline: true }
                        }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should not replace if regex does not match', async function () {
            const request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'Mi nombre es (\\w+)$'
                        }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
        });

        it('should support copying regex match into object response field', async function () {
            const request = { data: 'My name is mountebank' },
                response = { outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { outer: { inner: 'Hello, mountebank' } });
        });

        it('should support copying regex match into all response fields', async function () {
            const request = { data: 'My name is mountebank' },
                response = { data: '${you}', outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'mountebank', outer: { inner: 'Hello, mountebank' } });
        });

        it('should support copying regex match from object request field', async function () {
            const request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: { data: 'name' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support copying regex match from object request field ignoring case of key', async function () {
            const request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: { data: 'NAME' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support copying regex indexed groups from request', async function () {
            const request = { name: 'The date is 2016-12-29' },
                response = { data: 'Year ${DATE}[1], Month ${DATE}[2], Day ${DATE}[3]: ${DATE}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'name',
                        into: '${DATE}',
                        using: { method: 'regex', selector: '(\\d{4})-(\\d{2})-(\\d{2})' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Year 2016, Month 12, Day 29: 2016-12-29' });
        });

        it('should default to first value in multi-valued request field', async function () {
            const request = { data: ['first', 'second', 'third'] },
                response = { data: 'Grabbed the ${num}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'data',
                        into: '${num}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Grabbed the first' });
        });

        it('should support copying xpath match into response', async function () {
            const request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should ignore xpath if does not match', async function () {
            const request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
        });

        it('should ignore xpath if field is not xml', async function () {
            const request = { field: '' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            logger.warn.assertLogged('[xmldom error]\tinvalid doc source\n@#[line:undefined,col:undefined] (source: "")');
        });

        it('should support replacing token with xml attribute', async function () {
            const request = { field: '<doc><tool name="mountebank">Service virtualization</tool></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//tool/@name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support replacing token with xml direct text', async function () {
            const request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name/text()' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support replacing token with namespaced xml field', async function () {
            const request = { field: '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: {
                            method: 'xpath',
                            selector: '//mb:name',
                            ns: { mb: 'http://example.com/mb' }
                        }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support multiple indexed xpath matches into response', async function () {
            const request = { field: '<doc><num>3</num><num>2</num><num>1</num></doc>' },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'xpath', selector: '//num' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: '3, 2, 1' });
        });

        it('should ignore jsonpath selector if field is not json', async function () {
            const request = { field: 'mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            logger.warn.assertLogged('Cannot parse as JSON: "mountebank"');
        });

        it('should support replacing token with jsonpath selector', async function () {
            const request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
        });

        it('should support replacing token key with jsonpath selector', async function () {
            const request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: { '${you}': '${you}' } },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: { mountebank: 'mountebank' } });
        });

        it('should not replace token if jsonpath selector does not match', async function () {
            const request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..title' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
        });

        it('should support replacing multiple indexed tokens with jsonpath selector', async function () {
            const request = { field: JSON.stringify({ numbers: [{ key: 3 }, { key: 2 }, { key: 1 }] }) },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'jsonpath', selector: '$..key' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { data: '3, 2, 1' });
        });

        it('should accept null response fields (issue #394)', async function () {
            const request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { first: null, second: 'TOKEN' },
                logger = Logger.create(),
                config = {
                    copy: {
                        from: 'field',
                        into: 'TOKEN',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }
                },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { first: null, second: 'mountebank' });
        });

        it('should not be valid if missing "from" field', function () {
            const config = { into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field required',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "from" field is not a string or an object', function () {
            const config = { from: 0, into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must be a string or an object, representing the request field to select from',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "from" object field has zero keys', function () {
            const config = {
                    from: {},
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must have exactly one key',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "from" object field has multiple keys', function () {
            const config = {
                    from: { first: 'first', second: 'second' },
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must have exactly one key',
                source: { copy: config }
            }]);
        });

        it('should not be valid if missing "into" field', function () {
            const config = { from: 'field', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field required',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "into" field is not a string', function () {
            const config = { from: 'field', into: 0, using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field must be a string, representing the token to replace in response fields',
                source: { copy: config }
            }]);
        });

        it('should not be valid if missing "using" field', function () {
            const config = { from: 'field', into: 'TOKEN' },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using" field required',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "using.method" field is missing', function () {
            const config = { from: 'field', into: 'TOKEN', using: { selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field required',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "using.method" field is not supported', function () {
            const config = { from: 'field', into: 'TOKEN', using: { method: 'INVALID', selector: '.*' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field must be one of [regex, xpath, jsonpath]',
                source: { copy: config }
            }]);
        });

        it('should not be valid if "using.selector" field is missing', function () {
            const config = { from: 'field', into: 'TOKEN', using: { method: 'regex' } },
                errors = behaviors.validate([{ copy: config }]);

            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.selector" field required',
                source: { copy: config }
            }]);
        });
    });
});
