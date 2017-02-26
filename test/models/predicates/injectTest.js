'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/predicates'),
    util = require('util');

describe('predicates', function () {
    describe('#inject', function () {
        it('should return true if injected function returns true', function () {
            var predicate = { inject: 'function () { return true; }' },
                request = {};
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if injected function returns false', function () {
            var predicate = { inject: 'function () { return false; }' },
                request = {};
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if injected function matches request', function () {
            var fn = function (obj) {
                    return obj.path === '/' && obj.method === 'GET';
                },
                predicate = { inject: fn.toString() },
                request = { path: '/', method: 'GET' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should log injection exceptions', function () {
            var errorsLogged = [],
                logger = {
                    error: function () {
                        var message = util.format.apply(this, Array.prototype.slice.call(arguments));
                        errorsLogged.push(message);
                    }
                },
                predicate = { inject: 'function () {  throw Error("BOOM!!!"); }' },
                request = {};

            try {
                predicates.evaluate(predicate, request, 'utf8', logger);
                assert.fail('should have thrown exception');
            }
            catch (error) {
                assert.strictEqual(error.message, 'invalid predicate injection');
                assert.ok(errorsLogged.indexOf('injection X=> Error: BOOM!!!') >= 0);
            }
        });

        it('should allow changing the state in the injection', function () {
            var mockedImposterState = { foo: 'bar' },
                expectedImposterState = { foo: 'barbar' },
                mockedLogger = {
                    error: function () {
                    }
                };
            var fn = function (request, logger, imposterState) {
                    imposterState.foo = 'barbar';
                    return true;
                },
                predicate = { inject: fn.toString() },
                request = { path: '/', method: 'GET' };
            assert.ok(predicates.evaluate(predicate, request, 'utf8', mockedLogger, mockedImposterState));
            assert.deepEqual(mockedImposterState, expectedImposterState);
        });

        it('should not run injection during dry run validation', function () {
            var fn = function () { throw new Error('BOOM!'); },
                predicate = { inject: fn.toString() },
                request = { isDryRun: true };
            assert.ok(predicates.evaluate(predicate, request));
        });
    });
});
