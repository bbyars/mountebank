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

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.overwriteAll([thirdStub]))
                .then(() => {
                    return stubs.all().then(all => {
                        const responses = all.map(stub => stub.responses);

                        assert.deepEqual(responses, [
                            [{ is: 'fifth' }, { is: 'sixth' }]
                        ]);
                    });
                });
        });
    });

    describe('#overwriteAtIndex', function () {
        promiseIt('should overwrite single stub', function () {
            const stubs = StubRepository.create('utf8'),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.overwriteAtIndex(thirdStub, 1))
                .then(() => stubs.all())
                .then(all => {
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

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.add(thirdStub))
                .then(() => stubs.deleteAtIndex(0))
                .then(() => stubs.all())
                .then(all => {
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

            return stubs.add(stub)
                .then(() => stubs.all())
                .then(all => {
                    all[0].responses.push('RESPONSE');
                    return stubs.all();
                }).then(all => {
                    assert.deepEqual(jsonWithoutFunctions(all), [{ responses: [] }]);
                });
        });

        promiseIt('should support adding responses', function () {
            const stubs = StubRepository.create('utf8'),
                stub = { responses: [] };

            return stubs.add(stub)
                .then(() => stubs.all())
                .then(all => {
                    all[0].addResponse('RESPONSE');
                    return stubs.all();
                }).then(all => {
                    assert.deepEqual(jsonWithoutFunctions(all), [{ responses: ['RESPONSE'] }]);
                });
        });
    });

    describe('#getResponseFor', function () {
        promiseIt('should return default response if no match', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() };

            return stubs.getResponseFor({ field: 'value' }, logger, {}).then(responseConfig => {
                assert.deepEqual(responseConfig.is, {});
            });
        });

        promiseIt('should always match if no predicate', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'first stub' }] };

            return stubs.add(stub)
                .then(() => stubs.getResponseFor({ field: 'value' }, logger, {}))
                .then(responseConfig => {
                    assert.strictEqual(responseConfig.is, 'first stub');
                });
        });

        promiseIt('should return first match', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                firstStub = { predicates: [{ equals: { field: '1' } }], responses: [{ is: 'first stub' }] },
                secondStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'second stub' }] },
                thirdStub = { predicates: [{ equals: { field: '2' } }], responses: [{ is: 'third stub' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.add(thirdStub))
                .then(() => stubs.getResponseFor({ field: '2' }, logger, {}))
                .then(responseConfig => {
                    assert.strictEqual(responseConfig.is, 'second stub');
                });
        });

        promiseIt('should return responses in order, looping around', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'first response' }, { is: 'second response' }] };

            return stubs.add(stub).then(() => {
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'second response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
            });
        });

        promiseIt('should support recording matches', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                matchingRequest = { field: 'value' },
                mismatchingRequest = { field: 'other' },
                stub = { predicates: [{ equals: { field: 'value' } }], responses: [{ is: 'first response' }] };

            return stubs.add(stub).then(() => {
                return stubs.getResponseFor(matchingRequest, logger, {});
            }).then(responseConfig => {
                responseConfig.recordMatch(matchingRequest, 'MATCHED');
                return stubs.getResponseFor(mismatchingRequest, logger, {});
            }).then(responseConfig => {
                responseConfig.recordMatch(mismatchingRequest, 'MISMATCHED');
                return stubs.all();
            }).then(all => {
                const matches = all[0].matches;
                matches.forEach(match => { match.timestamp = 'NOW'; });

                assert.deepEqual(matches, [{ request: matchingRequest, response: 'MATCHED', timestamp: 'NOW' }]);
            });
        });

        promiseIt('should only record match once for given response', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [{ is: 'response' }] };

            return stubs.add(stub).then(() => {
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                responseConfig.recordMatch({}, 'FIRST');
                responseConfig.recordMatch({}, 'SECOND');

                return stubs.all();
            }).then(all => {
                const matches = all[0].matches;
                matches.forEach(match => { match.timestamp = 'NOW'; });

                assert.deepEqual(matches, [{ request: {}, response: 'FIRST', timestamp: 'NOW' }]);
            });
        });

        promiseIt('should repeat a response and continue looping', function () {
            const stubs = StubRepository.create('utf8'),
                logger = { debug: mock() },
                stub = { responses: [
                    { is: 'first response', _behaviors: { repeat: 2 } },
                    { is: 'second response' }
                ] };

            return stubs.add(stub).then(() => {
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'second response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'first response');
                return stubs.getResponseFor({}, logger, {});
            }).then(responseConfig => {
                assert.strictEqual(responseConfig.is, 'second response');
            });
        });
    });
});
