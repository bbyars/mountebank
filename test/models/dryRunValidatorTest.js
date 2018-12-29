'use strict';

const assert = require('assert'),
    Validator = require('../../src/models/dryRunValidator'),
    promiseIt = require('../testHelpers').promiseIt,
    Logger = require('../fakes/fakeLogger'),
    testRequest = { requestFrom: '', path: '/', query: {}, method: 'GET', headers: {}, body: '' };

describe('dryRunValidator', () => {
    describe('#validate', () => {
        promiseIt('should be valid for an empty request', () => {
            const request = {},
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for a missing responses field', () => {
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

        promiseIt('should be valid for an empty stubs list', () => {
            const request = { stubs: [] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for valid stub', () => {
            const request = { stubs: [{ responses: [{ is: { statusCode: 400 } }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a valid predicate', () => {
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

        promiseIt('should be valid for a well formed predicate inject if injections are allowed', () => {
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

        promiseIt('should be true for a well formed response inject if injections are allowed', () => {
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

        promiseIt('should be true for a well formed decorator behavior if injections are allowed', () => {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, _behaviors: { decorate: decorator.toString() } }]
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

        promiseIt('should not be valid for response injection if injections are disallowed', () => {
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

        promiseIt('should not be valid for predicate injections if allowInjection is false', () => {
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

        promiseIt('should be false for a well formed decorator behavior if injections are not allowed', () => {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, _behaviors: { decorate: decorator.toString() } }]
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

        promiseIt('should be valid with a valid proxy response', () => {
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

        promiseIt('should not be valid if any stub is invalid', () => {
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

        promiseIt('should detect an invalid predicate', () => {
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
                        message: 'malformed stub request',
                        data: 'missing predicate',
                        source: { invalidPredicate: { path: '/test' } }
                    }]
                });
            });
        });

        promiseIt('should detect an invalid predicate mixed with valid predicates', () => {
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
                        message: 'malformed stub request',
                        data: 'missing predicate',
                        source: { invalidPredicate: { body: 'value' } }
                    }]
                });
            });
        });

        promiseIt('should detect a malformed predicate', () => {
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
                        message: 'malformed stub request',
                        data: 'missing predicate',
                        source: { headers: [{ exists: 'Test' }] }
                    }]
                });
            });
        });

        promiseIt('should reject unrecognized response resolver', () => {
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

        promiseIt('should not be valid if any response is invalid', () => {
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

        promiseIt('should not be valid if any response is invalid even if the predicates are false during dry run', () => {
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

        promiseIt('should add behavior validation errors', () => {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    _behaviors: {
                        wait: -1,
                        repeat: -1
                    }
                }] }] },
                validator = Validator.create({ testRequest });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [
                        {
                            code: 'bad data',
                            message: 'wait behavior "wait" field must be an integer greater than or equal to 0',
                            source: { wait: -1, repeat: -1 }
                        },
                        {
                            code: 'bad data',
                            message: 'repeat behavior "repeat" field must be an integer greater than 0',
                            source: { wait: -1, repeat: -1 }
                        }
                    ]
                });
            });
        });

        promiseIt('should allow functions as wait behavior if injections allowed', () => {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    _behaviors: { wait: '() => { return 1000; }' }
                }] }] },
                validator = Validator.create({ testRequest, allowInjection: true });

            return validator.validate(request, Logger.create()).then(result => {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not allow functions as wait behavior if injections not allowed', () => {
            const response = {
                    is: { statusCode: 400 },
                    _behaviors: { wait: '() => { return 1000; }' }
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

        promiseIt('should be false for a well formed endOfRequestResolver if injections are not allowed', () => {
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

        promiseIt('should be true for a well formed endOfRequestResolver if injections are allowed', () => {
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

        promiseIt('should not be valid for shellTransform if injections are disallowed', () => {
            const request = {
                    stubs: [{
                        responses: [{ is: {}, _behaviors: { shellTransform: ['command'] } }]
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

        promiseIt('should not be valid for proxy addDecorateBehavior if injections are disallowed', () => {
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
    });
});
