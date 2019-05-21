'use strict';

const assert = require('assert'),
    Q = require('q'),
    api = require('./../functionalTest/api/api').create(),
    client = require('./../functionalTest/api/http/baseHttpClient').create('http'),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../functionalTest/mb').create(port + 1);

function getMemoryUsedForManyRequests (mbPort, numRequests) {
    const stub = { responses: [{ is: { statusCode: 400 } }] },
        request = { protocol: 'http', port, stubs: [stub] },
        requestFn = () => client.get('/', port),
        allRequests = [];
    let originalProcess;

    for (let i = 0; i < numRequests; i += 1) {
        allRequests[i] = requestFn;
    }

    return client.post('/imposters', request, mbPort)
        .then(response => {
            assert.strictEqual(response.statusCode, 201);
            return client.get('/config', mbPort);
        })
        .then(response => {
            originalProcess = response.body.process;

            // Using Q.all above a certain requests threshold gives me an ETIMEDOUT or other errors
            return allRequests.reduce(Q.when, Q(true));
        })
        .then(() => client.get('/config', mbPort))
        .then(response => (response.body.process.rss - originalProcess.rss) / numRequests)
        .finally(() => client.del(`/imposters/${port}`, mbPort));
}

describe('mb memory usage', function () {
    this.timeout(600000);

    promiseIt('should not leak memory without --mock', function () {
        const numRequests = 15000,
            minIncreasedMemory = numRequests / 100;

        var baselineMemory;

        return mb.start()
            .then(() => getMemoryUsedForManyRequests(mb.port, numRequests))
            .then(memoryUsed => {
                baselineMemory = memoryUsed;
                console.log(`default memory usage with for ${numRequests} requests: ${memoryUsed}`);
                return mb.stop();
            }).then(() => mb.start(['--mock']))
            .then(() => getMemoryUsedForManyRequests(mb.port, numRequests))
            .then(memoryUsed => {
                console.log(`memory usage for ${numRequests} requests with --mock: ${memoryUsed}`);
                assert.ok(memoryUsed > baselineMemory + minIncreasedMemory, `Memory used: ${memoryUsed}`);
            }).finally(() => mb.stop());
    });
});
