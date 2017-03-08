'use strict';

var assert = require('assert'),
    Validator = require('../../src/models/dryRunValidator'),
    promiseIt = require('../testHelpers').promiseIt,
    Logger = require('../fakes/fakeLogger'),
    BaseRepository = require('../../src/models/stubRepository'),
    testRequest = { requestFrom: '', path: '/', query: {}, method: 'GET', headers: {}, body: '' },
    StubRepository = {
        create: function (proxy) {
            return BaseRepository.create(proxy, function (stub) {
                var response = {
                    statusCode: stub.statusCode || 200,
                    headers: stub.headers || {},
                    body: stub.body || ''
                };

                response.headers.connection = 'close';
                return response;
            });
        }
    };

describe('dryRunValidator', function () {
    describe('#validate', function () {
        promiseIt('should be valid for an empty request', function () {
            var request = {},
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for a missing responses field', function () {
            var request = { stubs: [{}] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = { stubs: [] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for valid stub', function () {
            var request = { stubs: [{ responses: [{ is: { statusCode: 400 } }] }] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a valid predicate', function () {
            var request = {
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
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a well formed predicate inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        predicates: [{ inject: 'function () { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be true for a well formed response inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: 'function () { return {}; }' }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be true for a well formed decorator behavior if injections are allowed', function () {
            var decorator = function (request, response) {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, _behaviors: { decorate: decorator.toString() } }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for response injection if injections are disallowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: 'function () { return {}; }' }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = {
                    stubs: [{
                        predicates: [{ inject: 'function () { return true; }' }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var decorator = function (request, response) {
                    response.body = 'Hello';
                },
                request = {
                    stubs: [{
                        responses: [{ is: { statusCode: 400 }, _behaviors: { decorate: decorator.toString() } }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = {
                    stubs: [{
                        responses: [{ proxy: { to: 'http://google.com' } }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid if any stub is invalid', function () {
            var request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 } }] },
                        {}
                    ]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ invalidPredicate: { path: '/test' } }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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

        promiseIt('should detect an invalid predicate mixed with valid predicates', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [
                            { equals: { path: '/test' } },
                            { invalidPredicate: { body: 'value' } }
                        ]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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

        promiseIt('should detect a malformed predicate', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: [{ headers: [{ exists: 'Test' }] }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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

        promiseIt('should reject unrecognized response resolver', function () {
            var request = {
                    stubs: [{
                        responses: [{ invalid: 'INVALID' }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = {
                    stubs: [{
                        responses: [
                            { is: { statusCode: 400 } },
                            { invalid: true }
                        ]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = {
                    stubs: [{
                        responses: [{ invalid: true }],
                        predicates: [{ equals: { path: '/does-not-match' } }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    _behaviors: {
                        wait: -1,
                        repeat: -1
                    }
                }] }] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request, Logger.create()).then(function (result) {
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

        promiseIt('should allow functions as wait behavior if injections allowed', function () {
            var request = { stubs: [{ responses: [{
                    is: { statusCode: 400 },
                    _behaviors: { wait: 'function () { return 1000; }' }
                }] }] },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not allow functions as wait behavior if injections not allowed', function () {
            var response = {
                    is: { statusCode: 400 },
                    _behaviors: { wait: 'function () { return 1000; }' }
                },
                request = { stubs: [{ responses: [response] }] },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var endOfRequestResolver = function () { return true; },
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var endOfRequestResolver = function () { return true; },
                request = {
                    protocol: 'tcp',
                    stubs: [{ responses: [{ is: { data: 'test' } }] }],
                    endOfRequestResolver: { inject: endOfRequestResolver.toString() }
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                });

            return validator.validate(request, Logger.create()).then(function (result) {
                assert.ok(result.isValid);
            });
        });

        promiseIt('should not be valid for shellTransform if injections are disallowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ is: {}, _behaviors: { shellTransform: 'command' } }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
            var proxy = {
                    to: 'http://google.com',
                    addDecorateBehavior: 'function (request, response) { response.body = ""; }'
                },
                request = {
                    stubs: [{
                        responses: [{ proxy: proxy }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request, Logger.create()).then(function (result) {
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
