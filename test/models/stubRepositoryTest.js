'use strict';

var assert = require('assert'),
    StubRepository = require('../../src/models/stubRepository'),
    mock = require('../mock').mock,
    promiseIt = require('../testHelpers').promiseIt,
    Q = require('q');

describe('stubRepository', function () {
    describe('#resolve', function () {

        promiseIt('should call resolve with default response if no match', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' };

            return stubs.resolve(request, logger).then(function () {
                assert.ok(resolver.wasCalledWith({ is: {} }, request, logger, []), resolver.message());
            });
        });

        promiseIt('should always match if no predicate', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' },
                stub = { responses: ['first stub'] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(function () {
                assert.ok(resolver.wasCalledWith('first stub', request, logger, [stub]), resolver.message());
            });
        });

        promiseIt('should return first match', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: '2' },
                firstStub = { predicates: [{ equals: { field: '1' } }], responses: ['first stub'] },
                secondStub = { predicates: [{ equals: { field: '2' } }], responses: ['second stub'] },
                thirdStub = { predicates: [{ equals: { field: '2' } }], responses: ['third stub'] };

            stubs.addStub(firstStub);
            stubs.addStub(secondStub);
            stubs.addStub(thirdStub);

            return stubs.resolve(request, logger).then(function () {
                assert.ok(resolver.wasCalledWith('second stub', request, logger,
                    [firstStub, secondStub, thirdStub]), resolver.message());
            });
        });

        promiseIt('should return responses in order, looping around', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' },
                stub = { responses: ['first response', 'second response'] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(function () {
                assert.ok(resolver.wasCalledWith('first response', request, logger, [stub]), resolver.message());
                return stubs.resolve(request, logger);
            }).then(function () {
                assert.ok(resolver.wasCalledWith('second response', request, logger, [stub]), resolver.message());
                return stubs.resolve(request, logger);
            }).then(function () {
                assert.ok(resolver.wasCalledWith('first response', request, logger, [stub]), resolver.message());
            });
        });

        promiseIt('should record matches', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, true),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: ['first response'] };

            stubs.addStub(stub);

            return stubs.resolve(matchingRequest, logger).then(function () {
                return stubs.resolve(mismatchingRequest, logger);
            }).then(function () {
                assert.strictEqual(stub.matches.length, 1);
                assert.deepEqual(stub.matches[0].request, matchingRequest);
            });
        });

        promiseIt('should not record matches if recordMatches is false', function () {
            var resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, false),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: ['first response'] };

            stubs.addStub(stub);

            return stubs.resolve(matchingRequest, logger).then(function () {
                return stubs.resolve(mismatchingRequest, logger);
            }).then(function () {
                assert.ok(!stub.hasOwnProperty('matches'));
            });
        });
    });
});
