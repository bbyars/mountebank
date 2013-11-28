'use strict';

var assert = require('assert'),
    Validator = require('../../../src/models/http/httpValidator');

describe('httpValidator', function () {

    describe('#isValid', function () {
        it('should be true for an empty request', function () {
            var request = {},
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be false for a missing responses field', function () {
            var request =  { stubs: [{}] },
                validator = Validator.create(request);

            assert.ok(!validator.isValid());
        });

        it('should be true for an empty stubs list', function () {
            var request = { stubs: [] },
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be true for valid stub', function () {
            var request =  { stubs: [{ responses: [{ is: { statusCode: 400 }  }] }] },
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be true for a valid predicate', function () {
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
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be true for a well formed predicate inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "function () { return true; }" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create(request, true);

            assert.ok(validator.isValid());
        });

        it('should be true for a well formed response inject if injections are allowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: "function () { return {}; }" }]
                    }]
                },
                validator = Validator.create(request, true);

            assert.ok(validator.isValid());
        });

        it('should be false for response injection if injections are disallowed', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: "function () { return {}; }" }]
                    }]
                },
                validator = Validator.create(request, false);

            assert.ok(!validator.isValid());
        });

        it('should be false for predicate injections if allowInjection is false', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "function () { return true; }" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create(request, false);

            assert.ok(!validator.isValid());
        });

        it('should be true with a valid proxy response', function () {
            var request = {
                    stubs: [{
                        responses: [{ proxy: 'http://google.com' }]
                    }]
                },
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be false with a valid proxyOnce response', function () {
            var request = {
                    stubs: [{
                        responses: [{ proxyOnce: 'http://google.com' }]
                    }]
                },
                validator = Validator.create(request);

            assert.ok(validator.isValid());
        });

        it('should be false if any stub is invalid', function () {
            var request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 }  }] },
                        {}
                    ]
                },
                validator = Validator.create(request);

            assert.ok(!validator.isValid());
        });
    });

    describe('#errors', function () {
        it('should be empty for valid request', function () {
            var request =  {},
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), []);
        });

        it('should add an error for a missing responses field', function () {
            var request =  { stubs: [{}] },
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: "'responses' must be a non-empty array"
            }]);
        });

        it('should detect an invalid predicate', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            path: { invalidPredicate: '/test' }
                        }
                    }]
                },
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: "no predicate 'invalidPredicate'",
                data: "Object #<Object> has no method 'invalidPredicate'",
                source: JSON.stringify(request.stubs[0])
            }]);
        });

        it('should detect an invalid predicate mixed with valid predicates', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            path: { is: '/test' },
                            body: { invalidPredicate: 'value' }
                        }
                    }]
                },
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: "no predicate 'invalidPredicate'",
                data: "Object #<Object> has no method 'invalidPredicate'",
                source: JSON.stringify(request.stubs[0])
            }]);
        });

        it('should detect a malformed predicate', function () {
            var request = {
                    stubs: [{
                        responses: [{}],
                        predicates: {
                            headers: [ { exists: 'Test' }]
                        }
                    }]
                },
                validator = Validator.create(request);

            // The deepEqual test periodically fails, as node seems to alternate between
            // two different errors that it throws in this condition
            assert.deepEqual(validator.errors()[0].message, 'malformed stub request');
        });

        it('should reject inject with no wrapper function', function () {
            var request = {
                    stubs: [{
                        predicates: { request: { inject: "return true;" } },
                        responses: [{ is: { body: 'Matched' }}]
                    }]
                },
                validator = Validator.create(request, true);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: 'malformed stub request',
                data: 'Unexpected token return',
                source: JSON.stringify(request.stubs[0])
            }]);
        });

        it('should reject unrecognized response resolver', function () {
            var request = {
                    stubs: [{
                        responses: [{ invalid: 'INVALID' }]
                    }]
                },
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: 'malformed stub request',
                data: 'unrecognized stub resolver',
                source: JSON.stringify(request.stubs[0])
            }]);
        });

        it('should explain response injections if allowInjection is false', function () {
            var request = {
                    stubs: [{
                        responses: [{ inject: 'function () { return {}; }' }]
                    }]
                },
                validator = Validator.create(request, false);

            assert.deepEqual(validator.errors(), [{
                code: 'invalid operation',
                message: 'inject is not allowed unless mb is run with the --allowInjection flag',
                source: JSON.stringify(request.stubs[0])
            }]);
        });

        it('should be describe errors for stub invalid stub', function () {
            var request = {
                    stubs: [
                        { responses: [{ is: { statusCode: 400 }  }] },
                        {}
                    ]
                },
                validator = Validator.create(request);

            assert.deepEqual(validator.errors(), [{
                code: 'bad data',
                message: "'responses' must be a non-empty array"
            }]);
        });
    });
});
