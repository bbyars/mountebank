'use strict';

const assert = require('assert'),
    Validator = require('../../src/models/dryRunValidator'),
    promiseIt = require('../testHelpers').promiseIt,
    Logger = require('../fakes/fakeLogger'),
    testRequest = { requestFrom: '', path: '/', query: {}, method: 'GET', headers: {}, body: '' };

describe('dryRunValidator', function () {
    describe('#validate', function () {
        promiseIt('should be valid for an empty request', function () {
            const request = {},
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for a missing responses field', function () {
            const request = { stubs: [{}] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: "'responses' must be a non-empty array",
                        source: {}
                    }]
                });
            });
        });

        promiseIt('should be valid for an empty stubs list', function () {
            const request = { stubs: [] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for valid stub', function () {
            const request = { stubs: [{ responses: [{ is: { statusCode: 400 } }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a valid predicate', function () {
            const request = {
                    stubs: [{
                        responses: [{ is: { body: 'test' } }],
                        predicates: [
                            { equals: { path: '/test' } },
                            { equals: { method: 'GET' } },
                            { equals: { body: 'BODY' } },
                            { exists: { headers: { TEST: true } } }
                        ]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a well formed predicate inject if injections are allowed', function () {
            const request = {
                    stubs: [{
                        predicates: [{ inject: '() => { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be true for a well formed response inject if injections are allowed', function () {
            const request = {
                    stubs: [{
                        responses: [{ inject: '() => { return {}; }' }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be true for a well formed decorator behavior if injections are allowed', function () {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, behaviors: [{ decorate: decorator.toString() }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for response injection if injections are disallowed', function () {
            const request = {
                    stubs: [{
                        responses: [{ inject: '() => { return {}; }' }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should not be valid for predicate injections if allowInjection is false', function () {
            const request = {
                    stubs: [{
                        predicates: [{ inject: '() => { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should be false for a well formed decorator behavior if injections are not allowed', function () {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, behaviors: [{ decorate: decorator.toString() }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should be valid with a valid proxy response', function () {
            const request = {
                    stubs: [{
                        responses: [{ proxy: { to: 'http://google.com' } }]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid if any stub is invalid', function () {
            const request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 } }] },
                        {}
                    ]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: "'responses' must be a non-empty array",
                        source: {}
                    }]
                });
            });
        });

        promiseIt('should detect an invalid predicate', function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ invalidPredicate: { path: '/test' } }]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'missing predicate',
                        source: { invalidPredicate: { path: '/test' } }
                    }]
                });
            });
        });

        promiseIt('should detect an invalid predicate mixed with valid predicates', function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [
                            { equals: { path: '/test' } },
                            { invalidPredicate: { body: 'value' } }
                        ]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'missing predicate',
                        source: { invalidPredicate: { body: 'value' } }
                    }]
                });
            });
        });

        promiseIt('should detect a malformed predicate', function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ headers: [{ exists: 'Test' }] }]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'missing predicate',
                        source: { headers: [{ exists: 'Test' }] }
                    }]
                });
            });
        });

        promiseIt('should reject unrecognized response resolver', function () {
            const request = {
                    stubs: [{
                        responses: [{ invalid: 'INVALID' }]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'unrecognized response type',
                        source: request.stubs[0].responses[0]
                    }]
                });
            });
        });

        promiseIt('should not be valid if any response is invalid', function () {
            const request = {
                    stubs: [{
                        responses: [
                            { is: { statusCode: 400 } },
                            { invalid: true }
                        ]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'unrecognized response type',
                        source: request.stubs[0].responses[1]
                    }]
                });
            });
        });

        promiseIt('should not be valid if any response is invalid even if the predicates are false during dry run', function () {
            const request = {
                    stubs: [{
                        responses: [{ invalid: true }],
                        predicates: [{ equals: { path: '/does-not-match' } }]
                    }]
                },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'unrecognized response type',
                        source: request.stubs[0].responses[0]
                    }]
                });
            });
        });

        promiseIt('should add behavior validation errors', function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    behaviors: [
                        { wait: -1 }
                    ]
                }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [
                        {
                            code: 'bad data',
                            message: 'wait behavior "wait" field must be an integer greater than or equal to 0',
                            source: { wait: -1 }
                        }
                    ]
                });
            });
        });

        promiseIt('should error on invalid response repeat number', function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    repeat: 0
                }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [
                        {
                            code: 'bad data',
                            message: '"repeat" field must be an integer greater than 0',
                            source: { is: { statusCode: 400 }, repeat: 0 }
                        }
                    ]
                });
            });
        });

        promiseIt('should error on invalid response repeat type', function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    repeat: true
                }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [
                        {
                            code: 'bad data',
                            message: '"repeat" field must be an integer greater than 0',
                            source: { is: { statusCode: 400 }, repeat: true }
                        }
                    ]
                });
            });
        });

        promiseIt('should allow functions as wait behavior if injections allowed', function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    behaviors: [{ wait: '() => { return 1000; }' }]
                }] }] },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not allow functions as wait behavior if injections not allowed', function () {
            const response = {
                    is: { statusCode: 400 },
                    behaviors: [{ wait: '() => { return 1000; }' }]
                },
                request = { stubs: [{ responses: [response] }] },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: { responses: [response] }
                    }]
                });
            });
        });

        promiseIt('should be false for a well formed endOfRequestResolver if injections are not allowed', function () {
            const endOfRequestResolver = () => true,
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: request.endOfRequestResolver
                    }]
                });
            });
        });

        promiseIt('should be true for a well formed endOfRequestResolver if injections are allowed', function () {
            const endOfRequestResolver = () => true,
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.ok(result.isValid);
            });
        });

        promiseIt('should not be valid for shellTransform if injections are disallowed', function () {
            const request = {
                    stubs: [{
                        responses: [{ is: {}, behaviors: [{ shellTransform: 'command' }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'Shell execution is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should not be valid for proxy addDecorateBehavior if injections are disallowed', function () {
            const proxy = {
                    to: 'http://google.com',
                    addDecorateBehavior: '(request, response) => { response.body = ""; }'
                },
                request = {
                    stubs: [{
                        responses: [{ proxy: proxy }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should error on unrecognized behavior', function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100 }, { INVALID: 100 }, { decorate: '() => {}' }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'Unrecognized behavior: "INVALID"',
                        source: { INVALID: 100 }
                    }]
                });
            });
        });

        promiseIt('should not error on valid behavior with unrecognized field', function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100, INVALID: 100 }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should error on two valid behaviors in same object', function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100, decorate: '() => {}' }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'Each behavior object must have only one behavior type',
                        source: { wait: 100, decorate: '() => {}' }
                    }]
                });
            });
        });
    });
});
