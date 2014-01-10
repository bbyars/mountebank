'use strict';

var assert = require('assert'),
    Validator = require('../../src/models/dryRunValidator'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
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

                // We don't want to use keepalive connections, because a test case
                // may shutdown the stub, which prevents new connections for
                // the port, but that won't prevent the system under test
                // from reusing an existing TCP connection after the stub
                // has shutdown, causing difficult to track down bugs when
                // multiple tests are run.
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

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for a missing responses field', function () {
            var request =  { stubs: [{}] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest });

            return validator.validate(request).then(function (result) {
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

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for valid stub', function () {
            var request =  { stubs: [{ responses: [{ is: { statusCode: 400 }  }] }] },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a valid predicate', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            path: { is: '/test' },
                            method: { is: 'GET' },
                            body: { is: 'BODY' },
                            headers: { exists: { 'TEST': true } }
                        }
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid for a well formed predicate inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "function () { return true; }" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                }),
                logger = { warn: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be true for a well formed response inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: "function () { return {}; }" }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                }),
                logger = { warn: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid for response injection if injections are disallowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: "function () { return {}; }" }]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'inject is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should not be valid for predicate injections if allowInjection is false', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "function () { return true; }" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: false
                });

            return validator.validate(request).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'invalid injection',
                        message: 'inject is not allowed unless mb is run with the --allowInjection flag',
                        source: request.stubs[0]
                    }]
                });
            });
        });

        promiseIt('should be valid with a valid proxy response', function () {
            var request = {
                    stubs: [{
                        responses: [{ proxy: 'http://google.com' }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should be valid with a valid proxyOnce response', function () {
            var request = {
                    stubs: [{
                        responses: [{ proxyOnce: 'http://google.com' }]
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: true,
                    errors: []
                });
            });
        });

        promiseIt('should not be valid if any stub is invalid', function () {
            var request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 }  }] },
                        {}
                    ]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
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
                        predicates: {
                            path: { invalidPredicate: '/test' }
                        }
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'malformed stub request',
                        data: "no predicate 'invalidPredicate'",
                        source: { invalidPredicate: '/test' }
                    }]
                });
            });
        });

        promiseIt('should detect an invalid predicate mixed with valid predicates', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            path: { is: '/test' },
                            body: { invalidPredicate: 'value' }
                        }
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'malformed stub request',
                        data: "no predicate 'invalidPredicate'",
                        source: { invalidPredicate: 'value' }
                    }]
                });
            });
        });

        promiseIt('should detect a malformed predicate', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            headers: [{ exists: 'Test' }]
                        }
                    }]
                },
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'malformed stub request',
                        data: 'predicate must be an object',
                        source: [{ exists: 'Test' }]
                    }]
                });
            });
        });

        promiseIt('should reject inject with no wrapper function', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "return true;" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create({
                    StubRepository: StubRepository,
                    testRequest: testRequest,
                    allowInjection: true
                }),
                logger = { warn: mock(), error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'malformed stub request',
                        data: 'invalid predicate injection',
                        source: '(return true;)(scope);'
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
                validator = Validator.create({ StubRepository: StubRepository, testRequest: testRequest }),
                logger = { error: mock() };

            return validator.validate(request, logger).then(function (result) {
                assert.deepEqual(result, {
                    isValid: false,
                    errors: [{
                        code: 'bad data',
                        message: 'unrecognized stub resolver',
                        source: request.stubs[0].responses[0]
                    }]
                });
            });
        });
    });
});
