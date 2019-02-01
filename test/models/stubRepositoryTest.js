'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    StubRepository = require('../../src/models/stubRepository');

describe('stubRepository', function () {
    function jsonWithoutFunctions (obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    describe('#addStub', function () {
        it('should add new stub in front of passed in response', function () {
            const stubs = StubRepository.create('utf8'),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] };

            stubs.addStub(firstStub);
            stubs.addStub(secondStub);

            stubs.addStub({ responses: [{ is: 'TEST' }] }, { is: 'fourth' });
            const responses = stubs.stubs().map(stub => stub.responses);

            assert.deepEqual(responses, [
                [{ is: 'first' }, { is: 'second' }],
                [{ is: 'TEST' }],
                [{ is: 'third' }, { is: 'fourth' }]
            ]);
        });
    });

    describe('#stubs', function () {
        it('should not allow changing state in stubRepository', function () {
            const stubs = StubRepository.create('utf8'),
                stub = { responses: [] };

            stubs.addStub(stub);
            stubs.stubs()[0].responses.push('RESPONSE');

            assert.deepEqual(jsonWithoutFunctions(stubs.stubs()), [{ responses: [] }]);
        });

        it('should support adding responses', function () {
            const stubs = StubRepository.create('utf8'),
                stub = { responses: [] };

            stubs.addStub(stub);
            stubs.stubs()[0].addResponse('RESPONSE');

            assert.deepEqual(jsonWithoutFunctions(stubs.stubs()), [{ responses: ['RESPONSE'] }]);
        });
    });

    describe('#getResponseFor', function () {
        it('should return default response if no match', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() };

            const responseConfig = stubs.getResponseFor({ field: 'value' }, logger, {});

            assert.deepEqual(responseConfig.is, {});
        });

        it('should always match if no predicate', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'first stub' }] };

            stubs.addStub(stub);
            const responseConfig = stubs.getResponseFor({ field: 'value' }, logger, {});

            assert.strictEqual(responseConfig.is, 'first stub');
        });

        it('should return first match', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                firstStub = { predicates: [{ equals: { field: '1' } }], responses: [{ is: 'first stub' }] },
                secondStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'second stub' }] },
                thirdStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'third stub' }] };

            stubs.addStub(firstStub);
            stubs.addStub(secondStub);
            stubs.addStub(thirdStub);
            const responseConfig = stubs.getResponseFor({ field: '2' }, logger, {});

            assert.strictEqual(responseConfig.is, 'second stub');
        });

        it('should return responses in order, looping around', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'first response' }, { is: 'second response' }] };

            stubs.addStub(stub);

            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
        });

        it('should support recording matches', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: [{ is: 'first response' }] };

            stubs.addStub(stub);
            stubs.getResponseFor(matchingRequest, logger, {}).recordMatch('MATCHED');
            stubs.getResponseFor(mismatchingRequest, logger, {}).recordMatch('MISMATCHED');
            const matches = stubs.stubs()[0].matches;
            matches.forEach(match => { match.timestamp = 'NOW'; });

            assert.deepEqual(matches, [{ request: matchingRequest, response: 'MATCHED', timestamp: 'NOW' }]);
        });

        it('should only record match once for given response', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'response' }] };

            stubs.addStub(stub);
            const responseConfig = stubs.getResponseFor({}, logger, {});
            responseConfig.recordMatch('FIRST');
            responseConfig.recordMatch('SECOND');
            const matches = stubs.stubs()[0].matches;
            matches.forEach(match => { match.timestamp = 'NOW'; });

            assert.deepEqual(matches, [{ request: {}, response: 'FIRST', timestamp: 'NOW' }]);
        });

        it('should repeat a response and continue looping', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [
                    { is: 'first response', _behaviors: { repeat: 2 } },
                    { is: 'second response' }
                ] };

            stubs.addStub(stub);

            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
        });
    });
});
