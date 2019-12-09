'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    StubRepository = require('../../src/models/stubRepository'),
    promiseIt = require('../testHelpers').promiseIt;

describe('stubRepository', function () {
    function jsonWithoutFunctions (obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    describe('#overwriteAll', function () {
        promiseIt('should overwrite entire list', function () {
            const stubs = StubRepository.create('utf8'),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            stubs.add(firstStub);
            stubs.add(secondStub);
            stubs.overwriteAll([thirdStub]);

            return stubs.all().then(all => {
                const responses = all.map(stub => stub.responses);

                assert.deepEqual(responses, [
                    [{ is: 'fifth' }, { is: 'sixth' }]
                ]);
            });
        });
    });

    describe('#overwriteAtIndex', function () {
        promiseIt('should overwrite single stub', function () {
            const stubs = StubRepository.create('utf8'),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            stubs.add(firstStub);
            stubs.add(secondStub);

            return stubs.overwriteAtIndex(thirdStub, 1).then(() => {
                return stubs.all();
            }).then(all => {
                const responses = all.map(stub => stub.responses);

                assert.deepEqual(responses, [
                    [{ is: 'first' }, { is: 'second' }],
                    [{ is: 'fifth' }, { is: 'sixth' }]
                ]);
            });
        });
    });

    describe('#deleteAtIndex', function () {
        promiseIt('should overwrite single stub', function () {
            const stubs = StubRepository.create('utf8'),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            stubs.add(firstStub);
            stubs.add(secondStub);
            stubs.add(thirdStub);

            return stubs.deleteAtIndex(0).then(() => {
                return stubs.all();
            }).then(all => {
                const responses = all.map(stub => stub.responses);

                assert.deepEqual(responses, [
                    [{ is: 'third' }, { is: 'fourth' }],
                    [{ is: 'fifth' }, { is: 'sixth' }]
                ]);
            });
        });
    });

    describe('#all', function () {
        promiseIt('should not allow changing state in stubRepository', function () {
            const stubs = StubRepository.create('utf8'),
                stub = { responses: [] };

            stubs.add(stub);
            return stubs.all().then(all => {
                all[0].responses.push('RESPONSE');
                return stubs.all();
            }).then(all => {
                assert.deepEqual(jsonWithoutFunctions(all), [{ responses: [] }]);
            });
        });

        promiseIt('should support adding responses', function () {
            const stubs = StubRepository.create('utf8'),
                stub = { responses: [] };

            stubs.add(stub);
            return stubs.all().then(all => {
                all[0].addResponse('RESPONSE');
                return stubs.all();
            }).then(all => {
                assert.deepEqual(jsonWithoutFunctions(all), [{ responses: ['RESPONSE'] }]);
            });
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

            stubs.add(stub);
            const responseConfig = stubs.getResponseFor({ field: 'value' }, logger, {});

            assert.strictEqual(responseConfig.is, 'first stub');
        });

        it('should return first match', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                firstStub = { predicates: [{ equals: { field: '1' } }], responses: [{ is: 'first stub' }] },
                secondStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'second stub' }] },
                thirdStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'third stub' }] };

            stubs.add(firstStub);
            stubs.add(secondStub);
            stubs.add(thirdStub);
            const responseConfig = stubs.getResponseFor({ field: '2' }, logger, {});

            assert.strictEqual(responseConfig.is, 'second stub');
        });

        it('should return responses in order, looping around', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'first response' }, { is: 'second response' }] };

            stubs.add(stub);

            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
        });

        promiseIt('should support recording matches', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: [{ is: 'first response' }] };

            stubs.add(stub);
            stubs.getResponseFor(matchingRequest, logger, {}).recordMatch(matchingRequest, 'MATCHED');
            stubs.getResponseFor(mismatchingRequest, logger, {}).recordMatch(mismatchingRequest, 'MISMATCHED');

            return stubs.all().then(all => {
                const matches = all[0].matches;
                matches.forEach(match => { match.timestamp = 'NOW'; });

                assert.deepEqual(matches, [{ request: matchingRequest, response: 'MATCHED', timestamp: 'NOW' }]);
            });
        });

        promiseIt('should only record match once for given response', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'response' }] };

            stubs.add(stub);
            const responseConfig = stubs.getResponseFor({}, logger, {});
            responseConfig.recordMatch({}, 'FIRST');
            responseConfig.recordMatch({}, 'SECOND');

            return stubs.all().then(all => {
                const matches = all[0].matches;
                matches.forEach(match => { match.timestamp = 'NOW'; });

                assert.deepEqual(matches, [{ request: {}, response: 'FIRST', timestamp: 'NOW' }]);
            });
        });

        it('should repeat a response and continue looping', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [
                    { is: 'first response', _behaviors: { repeat: 2 } },
                    { is: 'second response' }
                ] };

            stubs.add(stub);

            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'first response');
            assert.strictEqual(stubs.getResponseFor({}, logger, {}).is, 'second response');
        });
    });
});
