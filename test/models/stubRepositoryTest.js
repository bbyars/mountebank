'use strict';

const assert = require('assert'),
    StubRepository = require('../../src/models/stubRepository'),
    mock = require('../mock').mock,
    promiseIt = require('../testHelpers').promiseIt,
    Q = require('q');

describe('stubRepository', function () {
    describe('#resolve', function () {

        promiseIt('should call resolve with default response if no match', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' };

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith({ is: {} }, request, logger, []), resolver.message());
            });
        });

        promiseIt('should always match if no predicate', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' },
                stub = { responses: ['first stub'] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith('first stub', request, logger, [stub]), resolver.message());
            });
        });

        promiseIt('should return first match', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: '2' },
                firstStub = { predicates: [{ equals: { field: '1' } }], responses: ['first stub'] },
                secondStub = { predicates: [{ equals: { field: '2' } }], responses: ['second stub'] },
                thirdStub = { predicates: [{ equals: { field: '2' } }], responses: ['third stub'] };

            stubs.addStub(firstStub);
            stubs.addStub(secondStub);
            stubs.addStub(thirdStub);

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith('second stub'), resolver.message());
            });
        });

        promiseIt('should return responses in order, looping around', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }),
                logger = { debug: mock() },
                request = { field: 'value' },
                stub = { responses: ['first response', 'second response'] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith('first response'), resolver.message());
                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith('second response'), resolver.message());
                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith('first response'), resolver.message());
            });
        });

        promiseIt('should record matches', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, true),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: ['first response'] };

            stubs.addStub(stub);

            return stubs.resolve(matchingRequest, logger).then(() => stubs.resolve(mismatchingRequest, logger)).then(() => {
                assert.strictEqual(stub.matches.length, 1);
                assert.deepEqual(stub.matches[0].request, matchingRequest);
            });
        });

        promiseIt('should not record matches if recordMatches is false', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, false),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: ['first response'] };

            stubs.addStub(stub);

            return stubs.resolve(matchingRequest, logger).then(() => stubs.resolve(mismatchingRequest, logger)).then(() => {
                assert.ok(!stub.hasOwnProperty('matches'));
            });
        });

        promiseIt('should return a repeat response only a set number of times', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, false),
                logger = { debug: mock() },
                request = { field: 'value' },
                stub = { responses: [
                    { is: { body: 'first response' }, _behaviors: { repeat: 2 } },
                    { is: { body: 'second response' } }
                ] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith({ is: { body: 'first response' }, _behaviors: { repeat: 2 } },
                    request, logger, [stub]), resolver.message());

                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith({ is: { body: 'first response' }, _behaviors: { repeat: 2 } },
                    request, logger, [stub]), resolver.message());

                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith({ is: { body: 'second response' } },
                    request, logger, [stub]), resolver.message());
            });
        });

        promiseIt('should loop back around after repeats are exhausted', function () {
            const resolver = mock().returns(Q()),
                stubs = StubRepository.create({ resolve: resolver }, false),
                logger = { debug: mock() },
                request = { field: 'value' },
                firstResponse = { is: { body: 'first response' }, _behaviors: { repeat: 1 } },
                secondResponse = { is: { body: 'second response' }, _behaviors: { repeat: 2 } },
                stub = { responses: [firstResponse, secondResponse] };

            stubs.addStub(stub);

            return stubs.resolve(request, logger).then(() => {
                assert.ok(resolver.wasCalledWith(firstResponse), resolver.message());
                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith(secondResponse), resolver.message());
                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith(secondResponse), resolver.message());
                return stubs.resolve(request, logger);
            }).then(() => {
                assert.ok(resolver.wasCalledWith(firstResponse), resolver.message());
            });
        });
    });
});
