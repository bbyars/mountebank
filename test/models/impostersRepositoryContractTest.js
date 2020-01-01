'use strict';

/**
 * Tests the semantics of each repository implementation to ensure they function equivalently
 */

/* eslint max-nested-callbacks: 0 */

const assert = require('assert'),
    promiseIt = require('../testHelpers').promiseIt,
    fs = require('fs-extra'),
    types = [
        {
            name: 'inMemoryImpostersRepository',
            create: require('../../src/models/inMemoryImpostersRepository').create,
            beforeEach: () => {},
            afterEach: () => {}
        },
        {
            name: 'filesystemBackedImpostersRepository',
            create: () => require('../../src/models/filesystemBackedImpostersRepository').create({ datadir: '.mbtest' }),
            beforeEach: () => {},
            afterEach: () => { fs.removeSync('.mbtest'); }
        }
    ],
    mock = require('../mock').mock,
    Q = require('q');

function stripFunctions (obj) {
    return JSON.parse(JSON.stringify(obj));
}

types.forEach(function (type) {
    describe(type.name, function () {
        let repo;

        beforeEach(function () {
            type.beforeEach();
            repo = type.create();
        });

        afterEach(type.afterEach);

        describe('#add', function () {
            promiseIt('should allow a reciprocal get', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.get(1))
                    .then(imposter => {
                        assert.deepEqual(imposter, { port: 1, value: 2, stubs: [] });
                    });
            });
        });

        describe('#get', function () {
            promiseIt('should return null if no imposter exists', function () {
                return repo.get(1).then(imposter => {
                    assert.strictEqual(imposter, null);
                });
            });
        });

        describe('#all', function () {
            promiseIt('should return an empty list if nothing added', function () {
                return repo.all().then(imposters => {
                    assert.deepEqual(imposters, []);
                });
            });

            promiseIt('should return all previously added keyed by port', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.add({ port: 2, value: 3 }))
                    .then(repo.all)
                    .then(imposters => {
                        assert.deepEqual(imposters, {
                            1: { port: 1, value: 2, stubs: [] },
                            2: { port: 2, value: 3, stubs: [] }
                        });
                    });
            });
        });

        describe('#exists', function () {
            promiseIt('should return false if given port has not been added', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.exists(2))
                    .then(exists => {
                        assert.strictEqual(exists, false);
                    });
            });

            promiseIt('should return true if given port has been added', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.exists(1))
                    .then(exists => {
                        assert.strictEqual(exists, true);
                    });
            });
        });

        describe('#del', function () {
            promiseIt('should return null if imposter never added', function () {
                return repo.del(1).then(imposter => {
                    assert.strictEqual(imposter, null);
                });
            });

            promiseIt('should return imposter and remove from list', function () {
                return repo.add({ port: 1, value: 2, stop: mock().returns(Q()) })
                    .then(() => repo.del(1))
                    .then(imposter => {
                        assert.deepEqual(stripFunctions(imposter), { port: 1, value: 2, stubs: [] });
                        return repo.get(1);
                    }).then(imposter => {
                        assert.strictEqual(imposter, null);
                    });
            });

            promiseIt('should call stop() on the imposter', function () {
                const imposter = { port: 1, value: 2, stop: mock().returns(Q()) };
                return repo.add(imposter)
                    .then(() => repo.del(1))
                    .then(() => {
                        assert.ok(imposter.stop.wasCalled(), imposter.stop.message());
                    });
            });
        });

        describe('#deleteAllSync', function () {
            promiseIt('should call stop() on all imposters and empty list', function () {
                const first = { port: 1, value: 2, stop: mock().returns(Q()) },
                    second = { port: 2, value: 3, stop: mock().returns(Q()) };
                return repo.add(first)
                    .then(() => repo.add(second))
                    .then(() => {
                        repo.deleteAllSync();
                        assert.ok(first.stop.wasCalled(), first.stop.message());
                        assert.ok(second.stop.wasCalled(), second.stop.message());
                        return repo.all();
                    }).then(imposters => {
                        assert.deepEqual(imposters, []);
                    });
            });
        });

        describe('#deleteAll', function () {
            promiseIt('should call stop() on all imposters and empty list', function () {
                const first = { port: 1, value: 2, stop: mock().returns(Q()) },
                    second = { port: 2, value: 3, stop: mock().returns(Q()) };
                return repo.add(first)
                    .then(() => repo.add(second))
                    .then(repo.deleteAll)
                    .then(() => {
                        assert.ok(first.stop.wasCalled(), first.stop.message());
                        assert.ok(second.stop.wasCalled(), second.stop.message());
                        return repo.all();
                    }).then(imposters => {
                        assert.deepEqual(imposters, []);
                    });
            });
        });

        describe('#stubsFor', function () {
            describe('#count', function () {
                promiseIt('should be 0 if no stubs on the imposter', function () {
                    return repo.add({ port: 1 })
                        .then(repo.stubsFor(1).count)
                        .then(count => {
                            assert.strictEqual(0, count);
                        });
                });

                promiseIt('should provide count of all stubs on imposter', function () {
                    const stubs = repo.stubsFor(1);
                    return repo.add({ port: 1, protocol: 'test' })
                        .then(() => stubs.add({ responses: [{ is: { field: 1 } }] }))
                        .then(() => stubs.add({ responses: [{ is: { field: 2 } }] }))
                        .then(stubs.count)
                        .then(count => {
                            assert.strictEqual(2, count);
                        });
                });
            });

            describe('#first', function () {
                promiseIt('should default empty array to filter function if no predicates on stub', function () {
                    const stubs = repo.stubsFor(1);
                    return repo.add({ responses: [] })
                        .then(() => stubs.first(predicates => {
                            assert.deepEqual(predicates, []);
                            return true;
                        }));
                });

                promiseIt('should return default stub if no match', function () {
                    const stubs = repo.stubsFor(1);
                    return repo.add({ port: 1, protocol: 'test' })
                        .then(() => stubs.first(() => false))
                        .then(match => {
                            assert.strictEqual(match.success, false);
                            assert.strictEqual(match.index, -1);
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: {} });
                        });
                });

                promiseIt('should return match with index', function () {
                    const stubs = repo.stubsFor(1),
                        firstStub = { predicates: [{ equals: { field: 'value' } }], responses: [{ is: 'first' }] },
                        secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] };

                    // This simulates the actual order of operations; adding stubs (in imposter.js)
                    // before adding the imposter (in impostersController.js)
                    return stubs.add(firstStub)
                        .then(() => stubs.add(secondStub))
                        .then(() => stubs.add(thirdStub))
                        .then(() => repo.add({ port: 1, protocol: 'test', stubs: [firstStub, secondStub, thirdStub] }))
                        .then(() => stubs.first(predicates => predicates.length === 0))
                        .then(match => {
                            assert.strictEqual(match.success, true);
                            assert.strictEqual(match.index, 1);
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: 'third' });
                        });
                });

                promiseIt('should loop through responses on nextResponse()', function () {
                    const stubs = repo.stubsFor(1),
                        stub = { responses: [{ is: 'first' }, { is: 'second' }] };
                    let matchedStub;

                    return stubs.add(stub)
                        .then(() => stubs.first(() => true))
                        .then(match => {
                            matchedStub = match.stub;
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: 'first' });
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: 'second' });
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: 'first' });
                        });
                });

                promiseIt('should handle repeat behavior on nextResponse()', function () {
                    const stubs = repo.stubsFor(1),
                        stub = { responses: [{ is: 'first', _behaviors: { repeat: 2 } }, { is: 'second' }] };
                    let matchedStub;

                    return stubs.add(stub)
                        .then(() => stubs.first(() => true))
                        .then(match => {
                            matchedStub = match.stub;
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(response.is, 'first');
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(response.is, 'first');
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(response.is, 'second');
                            return matchedStub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(response.is, 'first');
                        });
                });

                promiseIt('should support adding responses through addResponse()', function () {
                    const stubs = repo.stubsFor(1);

                    return stubs.add({})
                        .then(() => stubs.first(() => true))
                        .then(match => match.stub.addResponse({ is: { field: 1 } }))
                        .then(() => stubs.first(() => true))
                        .then(match => {
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: { field: 1 } });
                        });
                });
            });

            describe('#toJSON', function () {
                promiseIt('should return empty array if nothing added', function () {
                    return repo.stubsFor(1).toJSON().then(json => {
                        assert.deepEqual(json, []);
                    });
                });

                promiseIt('should return all predicates and original response order of all stubs', function () {
                    const stubs = repo.stubsFor(1),
                        first = {
                            predicates: [{ equals: { field: 'value' } }],
                            responses: [{ is: { field: 1 } }, { is: { field: 2 } }]
                        },
                        second = {
                            predicates: [],
                            responses: [{ is: { key: 'value' }, _behaviors: { repeat: 2 } }]
                        };

                    return stubs.add(first)
                        .then(() => stubs.add(second))
                        .then(() => stubs.first(() => true))
                        .then(match => match.stub.nextResponse())
                        .then(() => stubs.toJSON())
                        .then(json => {
                            assert.deepEqual(json, [first, second]);
                        });
                });
            });

            describe('#deleteSavedProxyResponses', function () {
                promiseIt('should remove recorded responses and stubs', function () {
                    const stubs = repo.stubsFor(1),
                        first = {
                            predicates: [{ equals: { key: 1 } }],
                            responses: [{ is: { field: 1, _proxyResponseTime: 100 } }]
                        },
                        second = {
                            predicates: [{ equals: { key: 2 } }],
                            responses: [
                                { is: { field: 2, _proxyResponseTime: 100 } },
                                { is: { field: 3 } }
                            ]
                        },
                        third = {
                            predicates: [],
                            responses: [{ proxy: { to: 'http://test.com' } }]
                        };

                    return stubs.add(first)
                        .then(() => stubs.add(second))
                        .then(() => stubs.add(third))
                        .then(() => stubs.deleteSavedProxyResponses())
                        .then(() => stubs.toJSON())
                        .then(json => {
                            assert.deepEqual(json, [
                                {
                                    predicates: [{ equals: { key: 2 } }],
                                    responses: [{ is: { field: 3 } }]
                                },
                                {
                                    predicates: [],
                                    responses: [{ proxy: { to: 'http://test.com' } }]
                                }
                            ]);
                        });
                });
            });

            describe('#overwriteAll', function () {
                promiseIt('should overwrite entire list', function () {
                    const stubs = repo.stubsFor(1),
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
                    const stubs = repo.stubsFor(1),
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
                    const stubs = repo.stubsFor(1),
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
                    const stubs = repo.stubsFor(1),
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
    });
});
