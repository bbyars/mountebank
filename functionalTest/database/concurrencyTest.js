'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt,
    Q = require('q');

describe('database concurrency', function () {
    this.timeout(10000);

    afterEach(function () {
        fs.removeSync('.mbtest');
    });

    describe('#nextResponse', function () {
        function responseFor (i) {
            return { is: { value: i } };
        }

        function valueFrom (response) {
            return Number(response.is.value);
        }

        promiseIt('should handle concurrent load correctly and performantly', function () {
            const repo = Repo.create({ datadir: '.mbtest' }).stubsFor(1000),
                startingValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                responses = startingValues.map(responseFor),
                start = new Date(),
                runs = responses.length * 10;

            return repo.add({ responses })
                .then(() => repo.first(() => true))
                .then(saved => {
                    const promises = [];
                    for (let i = 0; i < runs; i += 1) {
                        promises.push(saved.stub.nextResponse());
                    }
                    return Q.all(promises);
                }).then(results => {
                    const duration = new Date() - start,
                        values = results.map(valueFrom),
                        actual = {},
                        expected = {};

                    assert.ok(duration < runs * 50, `Took too long: ${duration}ms`);

                    // It's OK if responses are returned out of order -- we're running more or less concurrently after all
                    // The key for correctness is to ensure we get the right number in each bucket
                    startingValues.forEach(i => {
                        actual[i] = values.filter(value => value === i).length;
                        expected[i] = runs / responses.length;
                    });
                    assert.deepEqual(actual, expected, 'Unexpected response counts');
                });
        });
    });
});
