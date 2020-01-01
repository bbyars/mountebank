'use strict';

const assert = require('assert'),
    createStubsRepository = require('../../src/models/inMemoryImpostersRepository').create().createStubsRepository,
    promiseIt = require('../testHelpers').promiseIt;

describe('inMemoryImpostersRepository#stubsFor', function () {
    describe('#overwriteAll', function () {
        promiseIt('should overwrite entire list', function () {
            const stubs = createStubsRepository(),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.overwriteAll([thirdStub]))
                .then(() => {
                    return stubs.toJSON().then(all => {
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
            const stubs = createStubsRepository(),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.overwriteAtIndex(thirdStub, 1))
                .then(() => stubs.toJSON())
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
            const stubs = createStubsRepository(),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.add(thirdStub))
                .then(() => stubs.deleteAtIndex(0))
                .then(() => stubs.toJSON())
                .then(all => {
                    const responses = all.map(stub => stub.responses);

                    assert.deepEqual(responses, [
                        [{ is: 'third' }, { is: 'fourth' }],
                        [{ is: 'fifth' }, { is: 'sixth' }]
                    ]);
                });
        });
    });

    describe('#insertAtIndex', function () {
        promiseIt('should add single stub at given index', function () {
            const stubs = createStubsRepository(),
                firstStub = { responses: [{ is: 'first' }, { is: 'second' }] },
                secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                insertedStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

            return stubs.add(firstStub)
                .then(() => stubs.add(secondStub))
                .then(() => stubs.insertAtIndex(insertedStub, 0))
                .then(() => stubs.toJSON())
                .then(all => {
                    const responses = all.map(stub => stub.responses);

                    assert.deepEqual(responses, [
                        [{ is: 'fifth' }, { is: 'sixth' }],
                        [{ is: 'first' }, { is: 'second' }],
                        [{ is: 'third' }, { is: 'fourth' }]
                    ]);
                });
        });
    });
});
