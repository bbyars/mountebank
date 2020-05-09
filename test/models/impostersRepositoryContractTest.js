'use strict';

/**
 * Tests the semantics of each repository implementation to ensure they function equivalently
 */

/* eslint max-nested-callbacks: 0 */

const assert = require('assert'),
    promiseIt = require('../testHelpers').promiseIt,
    fs = require('fs-extra'),
    Logger = require('../fakes/fakeLogger'),
    types = [
        {
            name: 'inMemoryImpostersRepository',
            create: require('../../src/models/inMemoryImpostersRepository').create,
            beforeEach: () => {},
            afterEach: () => {}
        },
        {
            name: 'filesystemBackedImpostersRepository',
            create: () => require('../../src/models/filesystemBackedImpostersRepository').create({ datadir: '.mbtest' }, Logger.create()),
            beforeEach: () => {},
            afterEach: () => { fs.removeSync('.mbtest'); }
        }
    ],
    mock = require('../mock').mock,
    Q = require('q');

function imposterize (config) {
    const cloned = JSON.parse(JSON.stringify(config)),
        result = {
            creationRequest: cloned,
            port: cloned.port
        };
    Object.keys(cloned).forEach(key => {
        result[key] = cloned[key];
    });
    Object.keys(config).forEach(key => {
        if (typeof config[key] === 'function') {
            result[key] = config[key];
        }
    });
    return result;
}

function stripFunctions (obj) {
    return JSON.parse(JSON.stringify(obj));
}

function deimposterize (obj) {
    const withoutFunctions = stripFunctions(obj);
    if (Array.isArray(withoutFunctions)) {
        withoutFunctions.forEach(imposter => { delete imposter.creationRequest; });
    }
    delete withoutFunctions.creationRequest;
    return withoutFunctions;
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
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.get(1))
                    .then(imposter => {
                        assert.deepEqual(deimposterize(imposter), { port: 1, value: 2, stubs: [] });
                    });
            });

            promiseIt('should accept a string add and a number get', function () {
                return repo.add(imposterize({ port: '1', value: 2 }))
                    .then(() => repo.get(1))
                    .then(imposter => {
                        assert.deepEqual(deimposterize(imposter), { port: '1', value: 2, stubs: [] });
                    });
            });

            promiseIt('should accept a number add and a string get', function () {
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.get('1'))
                    .then(imposter => {
                        assert.deepEqual(deimposterize(imposter), { port: 1, value: 2, stubs: [] });
                    });
            });

            promiseIt('should save functions on imposter', function () {
                const imposter = {
                    port: 1,
                    truthy: () => true,
                    falsy: () => false
                };

                return repo.add(imposterize(imposter))
                    .then(() => repo.get('1'))
                    .then(saved => {
                        assert.ok(saved.truthy());
                        assert.ok(!saved.falsy());
                    });
            });
        });

        describe('#get', function () {
            promiseIt('should return null if no imposter exists', function () {
                return repo.get(1).then(imposter => {
                    assert.strictEqual(imposter, null);
                });
            });

            promiseIt('should retrieve with stubs', function () {
                const imposter = {
                    port: 1,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { key: 1 } }],
                        responses: [{ is: { field: 'value' } }]
                    }]
                };

                return repo.add(imposterize(imposter))
                    .then(() => repo.get('1'))
                    .then(saved => {
                        assert.deepEqual(deimposterize(saved), imposter);
                    });
            });
        });

        describe('#all', function () {
            promiseIt('should return an empty list if nothing added', function () {
                return repo.all().then(imposters => {
                    assert.deepEqual(imposters, []);
                });
            });

            promiseIt('should return all previously added', function () {
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.add(imposterize({ port: 2, value: 3 })))
                    .then(repo.all)
                    .then(imposters => {
                        assert.deepEqual(deimposterize(imposters), [
                            { port: 1, value: 2, stubs: [] },
                            { port: 2, value: 3, stubs: [] }
                        ]);
                    });
            });

            promiseIt('should return all added with stubs', function () {
                const first = {
                        port: 1,
                        stubs: [{
                            predicates: [{ equals: { key: 1 } }],
                            responses: [{ is: { field: 'value' } }]
                        }]
                    },
                    second = {
                        port: 2,
                        stubs: [{
                            predicates: [],
                            responses: [{ is: { key: 1 } }]
                        }]
                    };

                return repo.add(imposterize(first))
                    .then(() => repo.add(imposterize(second)))
                    .then(repo.all)
                    .then(imposters => {
                        assert.deepEqual(deimposterize(imposters), [first, second]);
                    });
            });
        });

        describe('#exists', function () {
            promiseIt('should return false if given port has not been added', function () {
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.exists(2))
                    .then(exists => {
                        assert.strictEqual(exists, false);
                    });
            });

            promiseIt('should return true if given port has been added', function () {
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.exists(1))
                    .then(exists => {
                        assert.strictEqual(exists, true);
                    });
            });

            promiseIt('should do type conversion if needed', function () {
                return repo.add(imposterize({ port: 1, value: 2 }))
                    .then(() => repo.exists('1'))
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
                return repo.add(imposterize({ port: 1, value: 2, stop: mock().returns(Q()) }))
                    .then(() => repo.del(1))
                    .then(imposter => {
                        assert.deepEqual(deimposterize(imposter), { port: 1, value: 2, stubs: [] });
                        return repo.get(1);
                    }).then(imposter => {
                        assert.strictEqual(imposter, null);
                    });
            });

            promiseIt('should call stop() on the imposter', function () {
                const imposter = { port: 1, value: 2, stop: mock().returns(Q()) };
                return repo.add(imposterize(imposter))
                    .then(() => repo.del(1))
                    .then(() => {
                        assert.ok(imposter.stop.wasCalled(), imposter.stop.message());
                    });
            });

            promiseIt('should empty the stubs associated with the imposter', function () {
                const stub = { responses: [{ is: { key: 'value' } }] },
                    imposter = { port: 1, stubs: [stub], stop: mock().returns(Q()) };
                return repo.add(imposterize(imposter))
                    .then(() => repo.del(1))
                    .then(() => repo.stubsFor(1).count())
                    .then(count => {
                        assert.strictEqual(count, 0);
                    });
            });
        });

        describe('#stopAllSync', function () {
            promiseIt('should call stop() on all imposters and empty list', function () {
                const first = { port: 1, value: 2, stop: mock().returns(Q()) },
                    second = { port: 2, value: 3, stop: mock().returns(Q()) };
                return repo.add(imposterize(first))
                    .then(() => repo.add(imposterize(second)))
                    .then(() => {
                        repo.stopAllSync();
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
                return repo.add(imposterize(first))
                    .then(() => repo.add(imposterize(second)))
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
                    return repo.add(imposterize({ port: 1 }))
                        .then(repo.stubsFor(1).count)
                        .then(count => {
                            assert.strictEqual(0, count);
                        });
                });

                promiseIt('should provide count of all stubs on imposter added initially', function () {
                    const imposter = {
                        port: 1,
                        protocol: 'test',
                        stubs: [
                            { responses: [{ is: { field: 1 } }] },
                            { responses: [{ is: { field: 2 } }] }
                        ]
                    };

                    return repo.add(imposterize(imposter))
                        .then(repo.stubsFor(1).count)
                        .then(count => {
                            assert.strictEqual(2, count);
                        });
                });

                promiseIt('should all stubs added after creation', function () {
                    const imposter = {
                        port: 1,
                        protocol: 'test',
                        stubs: [{ responses: [{ is: { field: 1 } }] }]
                    };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).add({ responses: [{ is: { field: 2 } }] }))
                        .then(repo.stubsFor(1).count)
                        .then(count => {
                            assert.strictEqual(2, count);
                        });
                });
            });

            describe('#first', function () {
                promiseIt('should default empty array to filter function if no predicates on stub', function () {
                    const imposter = {
                        port: 1,
                        stubs: [{ responses: [] }]
                    };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(predicates => {
                            assert.deepEqual(predicates, []);
                            return true;
                        }));
                });

                promiseIt('should return default stub if no match', function () {
                    const imposter = { port: 1, protocol: 'test' };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => false))
                        .then(match => {
                            assert.strictEqual(match.success, false);
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: {} });
                        });
                });

                promiseIt('should return match with index', function () {
                    const stubs = repo.stubsFor(1),
                        firstStub = { predicates: [{ equals: { field: 'value' } }], responses: [{ is: 'first' }] },
                        secondStub = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        thirdStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] },
                        imposter = { port: 1, protocol: 'test', stubs: [firstStub, secondStub, thirdStub] };

                    return repo.add(imposterize(imposter))
                        .then(() => stubs.first(predicates => predicates.length === 0))
                        .then(match => {
                            assert.strictEqual(match.success, true);
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: 'third' });
                            return response.stubIndex();
                        }).then(index => {
                            assert.strictEqual(index, 1);
                        });
                });

                promiseIt('should loop through responses on nextResponse()', function () {
                    const stub = { responses: [{ is: 'first' }, { is: 'second' }] },
                        imposter = { port: 1, stubs: [stub] };
                    let matchedStub;

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
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
                    const stub = { responses: [{ is: 'first', _behaviors: [{ repeat: 2 }] }, { is: 'second' }] },
                        imposter = { port: 1, stubs: [stub] };
                    let matchedStub;

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
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
                    const imposter = { port: 1, stubs: [{}] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
                        .then(match => match.stub.addResponse({ is: { field: 1 } }))
                        .then(() => repo.stubsFor(1).first(() => true))
                        .then(match => {
                            return match.stub.nextResponse();
                        }).then(response => {
                            assert.deepEqual(stripFunctions(response), { is: { field: 1 } });
                        });
                });

                promiseIt('should support recording matches', function () {
                    const imposter = { port: 1, stubs: [{}] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
                        .then(match => match.stub.recordMatch('REQUEST', 'RESPONSE'))
                        .then(() => repo.stubsFor(1).toJSON({ debug: true }))
                        .then(all => {
                            assert.strictEqual(1, all[0].matches.length);
                            delete all[0].matches[0].timestamp;
                            assert.deepEqual(all[0].matches, [{ request: 'REQUEST', response: 'RESPONSE' }]);
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
                    const first = {
                            predicates: [{ equals: { field: 'value' } }],
                            responses: [{ is: { field: 1 } }, { is: { field: 2 } }]
                        },
                        second = {
                            responses: [{ is: { key: 'value' }, _behaviors: [{ repeat: 2 }] }]
                        },
                        imposter = { port: 1, stubs: [first, second] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
                        .then(match => match.stub.nextResponse())
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(json => {
                            assert.deepEqual(json, [first, second]);
                        });
                });

                promiseIt('should not return matches if debug option not set', function () {
                    const imposter = { port: 1, stubs: [{}] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).first(() => true))
                        .then(match => match.stub.recordMatch('REQUEST', 'RESPONSE'))
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(all => {
                            assert.strictEqual(typeof all[0].matches, 'undefined');
                        });
                });
            });

            describe('#deleteSavedProxyResponses', function () {
                promiseIt('should remove recorded responses and stubs', function () {
                    const first = {
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
                            responses: [{ proxy: { to: 'http://test.com' } }]
                        },
                        imposter = { port: 1, stubs: [first, second, third] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).deleteSavedProxyResponses())
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(json => {
                            assert.deepEqual(json, [
                                {
                                    predicates: [{ equals: { key: 2 } }],
                                    responses: [{ is: { field: 3 } }]
                                },
                                {
                                    responses: [{ proxy: { to: 'http://test.com' } }]
                                }
                            ]);
                        });
                });
            });

            describe('#overwriteAll', function () {
                promiseIt('should overwrite entire list', function () {
                    const first = { responses: [{ is: 'first' }, { is: 'second' }] },
                        second = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        newStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] },
                        imposter = { port: 1, stubs: [first, second] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).overwriteAll([newStub]))
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(all => {
                            const responses = all.map(stub => stub.responses);

                            assert.deepEqual(responses, [
                                [{ is: 'fifth' }, { is: 'sixth' }]
                            ]);
                        });
                });
            });

            describe('#overwriteAtIndex', function () {
                promiseIt('should overwrite single stub', function () {
                    const first = { responses: [{ is: 'first' }, { is: 'second' }] },
                        second = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        newStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] },
                        imposter = { port: 1, stubs: [first, second] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).overwriteAtIndex(newStub, 1))
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(all => {
                            const responses = all.map(stub => stub.responses);

                            assert.deepEqual(responses, [
                                [{ is: 'first' }, { is: 'second' }],
                                [{ is: 'fifth' }, { is: 'sixth' }]
                            ]);
                        });
                });

                promiseIt('should reject the promise if no stub at that index', function () {
                    const imposter = { port: 1 };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).overwriteAtIndex({}, 0))
                        .then(() => {
                            assert.fail('Should have rejected');
                        }, err => {
                            assert.deepEqual(err, {
                                code: 'no such resource',
                                message: 'no stub at index 0'
                            });
                        });
                });
            });

            describe('#deleteAtIndex', function () {
                promiseIt('should delete single stub', function () {
                    const first = { responses: [{ is: 'first' }, { is: 'second' }] },
                        second = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        third = { responses: [{ is: 'fifth' }, { is: 'sixth' }] },
                        imposter = { port: 1, stubs: [first, second, third] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).deleteAtIndex(0))
                        .then(() => repo.stubsFor(1).toJSON())
                        .then(all => {
                            const responses = all.map(stub => stub.responses);

                            assert.deepEqual(responses, [
                                [{ is: 'third' }, { is: 'fourth' }],
                                [{ is: 'fifth' }, { is: 'sixth' }]
                            ]);
                        });
                });

                promiseIt('should reject the promise if no stub at that index', function () {
                    const imposter = { port: 1 };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).deleteAtIndex(0))
                        .then(() => {
                            assert.fail('Should have rejected');
                        }, err => {
                            assert.deepEqual(err, {
                                code: 'no such resource',
                                message: 'no stub at index 0'
                            });
                        });
                });
            });

            describe('#insertAtIndex', function () {
                promiseIt('should add single stub at given index', function () {
                    const first = { responses: [{ is: 'first' }, { is: 'second' }] },
                        second = { responses: [{ is: 'third' }, { is: 'fourth' }] },
                        insertedStub = { responses: [{ is: 'fifth' }, { is: 'sixth' }] },
                        imposter = { port: 1, stubs: [first, second] };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).insertAtIndex(insertedStub, 0))
                        .then(() => repo.stubsFor(1).toJSON())
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

            describe('#addRequest', function () {
                promiseIt('should save request with timestamp', function () {
                    const imposter = { port: 1 };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).addRequest({ field: 'value' }))
                        .then(() => repo.stubsFor(1).loadRequests())
                        .then(requests => {
                            assert.deepEqual(requests, [{ field: 'value', timestamp: requests[0].timestamp }]);
                            const delta = new Date() - Date.parse(requests[0].timestamp);
                            assert.ok(delta < 1000);
                        });
                });
            });

            describe('#deleteSavedRequests', function () {
                promiseIt('should clear the requests list', function () {
                    const imposter = { port: 1 };

                    return repo.add(imposterize(imposter))
                        .then(() => repo.stubsFor(1).addRequest({ field: 'value' }))
                        .then(() => repo.stubsFor(1).loadRequests())
                        .then(requests => {
                            assert.deepEqual(requests, [{ field: 'value', timestamp: requests[0].timestamp }]);
                        })
                        .then(() => repo.stubsFor(1).deleteSavedRequests())
                        .then(() => repo.stubsFor(1).loadRequests())
                        .then(requests => {
                            assert.deepEqual(requests, []);
                        });
                });
            });

            describe('#loadRequests', function () {
                promiseIt('should return requests in order without losing any', function () {
                    // Simulate enough rapid load to add two with the same millisecond timestamp
                    // The filesystemBackedImpostersRepository has to add some metadata to ensure
                    // we capture both if they occur at the same millisecond.
                    const stubs = repo.stubsFor(1);
                    return stubs.addRequest({ value: 1 })
                        .then(() => stubs.addRequest({ value: 2 }))
                        .then(() => stubs.addRequest({ value: 3 }))
                        .then(() => stubs.addRequest({ value: 4 }))
                        .then(() => stubs.addRequest({ value: 5 }))
                        .then(() => stubs.addRequest({ value: 6 }))
                        .then(() => stubs.addRequest({ value: 7 }))
                        .then(() => stubs.addRequest({ value: 8 }))
                        .then(() => stubs.addRequest({ value: 9 }))
                        .then(() => stubs.addRequest({ value: 10 }))
                        .then(() => stubs.loadRequests())
                        .then(requests => {
                            const values = requests.map(request => request.value);
                            assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
                        });
                });
            });
        });
    });
});
