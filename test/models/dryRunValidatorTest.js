'use strict';

const assert = require('assert'),
    Validator = require('../../src/models/dryRunValidator'),
    Logger = require('../fakes/fakeLogger'),
    testRequest = { requestFrom: '', path: '/', query: {}, method: 'GET', headers: {}, body: '' };

describe('dryRunValidator', function () {
    describe('#validate', function () {
        it('should be valid for an empty request', async function () {
            const request = {},
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should not be valid for a missing responses field', async function () {
            const request = { stubs: [{}] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: "'responses' must be a non-empty array",
                    source: {}
                }]
            });
        });

        it('should be valid for an empty stubs list', async function () {
            const request = { stubs: [] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should be valid for valid stub', async function () {
            const request = { stubs: [{ responses: [{ is: { statusCode: 400 } }] }] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should be valid for a valid predicate', async function () {
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
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should be valid for a well formed predicate inject if injections are allowed', async function () {
            const request = {
                    stubs: [{
                        predicates: [{ inject: '() => { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should be true for a well formed response inject if injections are allowed', async function () {
            const request = {
                    stubs: [{
                        responses: [{ inject: '() => { return {}; }' }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should be true for a well formed decorator behavior if injections are allowed', async function () {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, behaviors: [{ decorate: decorator.toString() }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should not be valid for response injection if injections are disallowed', async function () {
            const request = {
                    stubs: [{
                        responses: [{ inject: '() => { return {}; }' }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: request.stubs[0]
                }]
            });
        });

        it('should not be valid for predicate injections if allowInjection is false', async function () {
            const request = {
                    stubs: [{
                        predicates: [{ inject: '() => { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: request.stubs[0]
                }]
            });
        });

        it('should be false for a well formed decorator behavior if injections are not allowed', async function () {
            const decorator = (request, response) => {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, behaviors: [{ decorate: decorator.toString() }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: request.stubs[0]
                }]
            });
        });

        it('should be valid with a valid proxy response', async function () {
            const request = {
                    stubs: [{
                        responses: [{ proxy: { to: 'http://google.com' } }]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should not be valid if any stub is invalid', async function () {
            const request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 } }] },
                        {}
                    ]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: "'responses' must be a non-empty array",
                    source: {}
                }]
            });
        });

        it('should detect an invalid predicate', async function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ invalidPredicate: { path: '/test' } }]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'missing predicate',
                    source: { invalidPredicate: { path: '/test' } }
                }]
            });
        });

        it('should detect an invalid predicate mixed with valid predicates', async function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [
                            { equals: { path: '/test' } },
                            { invalidPredicate: { body: 'value' } }
                        ]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'missing predicate',
                    source: { invalidPredicate: { body: 'value' } }
                }]
            });
        });

        it('should detect a malformed predicate', async function () {
            const request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ headers: [{ exists: 'Test' }] }]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'missing predicate',
                    source: { headers: [{ exists: 'Test' }] }
                }]
            });
        });

        it('should reject unrecognized response resolver', async function () {
            const request = {
                    stubs: [{
                        responses: [{ invalid: 'INVALID' }]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'unrecognized response type',
                    source: request.stubs[0].responses[0]
                }]
            });
        });

        it('should not be valid if any response is invalid', async function () {
            const request = {
                    stubs: [{
                        responses: [
                            { is: { statusCode: 400 } },
                            { invalid: true }
                        ]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'unrecognized response type',
                    source: request.stubs[0].responses[1]
                }]
            });
        });

        it('should not be valid if any response is invalid even if the predicates are false during dry run', async function () {
            const request = {
                    stubs: [{
                        responses: [{ invalid: true }],
                        predicates: [{ equals: { path: '/does-not-match' } }]
                    }]
                },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'unrecognized response type',
                    source: request.stubs[0].responses[0]
                }]
            });
        });

        it('should add behavior validation errors', async function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    behaviors: [
                        { wait: -1 }
                    ]
                }] }] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

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

        it('should error on invalid response repeat number', async function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    repeat: 0
                }] }] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

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

        it('should error on invalid response repeat type', async function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    repeat: true
                }] }] },
                validator = Validator.create({ testRequest }),
                result = await validator.validate(request, Logger.create());

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

        it('should allow functions as wait behavior if injections allowed', async function () {
            const request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    behaviors: [{ wait: '() => { return 1000; }' }]
                }] }] },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should not allow functions as wait behavior if injections not allowed', async function () {
            const response = {
                    is: { statusCode: 400 },
                    behaviors: [{ wait: '() => { return 1000; }' }]
                },
                request = { stubs: [{ responses: [response] }] },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: { responses: [response] }
                }]
            });
        });

        it('should be false for a well formed endOfRequestResolver if injections are not allowed', async function () {
            const endOfRequestResolver = () => true,
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: request.endOfRequestResolver
                }]
            });
        });

        it('should be true for a well formed endOfRequestResolver if injections are allowed', async function () {
            const endOfRequestResolver = () => true,
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.ok(result.isValid);
        });

        it('should not be valid for shellTransform if injections are disallowed', async function () {
            const request = {
                    stubs: [{
                        responses: [{ is: {}, behaviors: [{ shellTransform: 'command' }] }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'Shell execution is not allowed unless mb is run with the --allowInjection flag',
                    source: request.stubs[0]
                }]
            });
        });

        it('should not be valid for proxy addDecorateBehavior if injections are disallowed', async function () {
            const proxy = {
                    to: 'http://google.com',
                    addDecorateBehavior: '(request, response) => { response.body = ""; }'
                },
                request = {
                    stubs: [{
                        responses: [{ proxy: proxy }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: false }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'invalid injection',
                    message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                    source: request.stubs[0]
                }]
            });
        });

        it('should error on unrecognized behavior', async function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100 }, { INVALID: 100 }, { decorate: '() => {}' }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: false,
                errors: [{
                    code: 'bad data',
                    message: 'Unrecognized behavior: "INVALID"',
                    source: { INVALID: 100 }
                }]
            });
        });

        it('should not error on valid behavior with unrecognized field', async function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100, INVALID: 100 }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

            assert.deepEqual(result, {
                isValid: true,
                errors: []
            });
        });

        it('should error on two valid behaviors in same object', async function () {
            const request = {
                    stubs: [{
                        responses: [{
                            is: { key: 'value' },
                            behaviors: [{ wait: 100, decorate: '() => {}' }]
                        }]
                    }]
                },
                validator = Validator.create({ testRequest, allowInjection: true }),
                result = await validator.validate(request, Logger.create());

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
