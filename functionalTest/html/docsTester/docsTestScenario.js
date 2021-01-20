'use strict';

function create (endpoint, id) {
    const steps = [];

    function addStep (stepSpec) {
        const step = {
            assertValid: stepSpec.assertValid,
            execute: async () => {
                const runner = require(`./testTypes/${stepSpec.type}`),
                    actualResponse = await runner.runStep(stepSpec);
                step.actualResponse = actualResponse;
            }
        };

        steps.push(step);
    }

    async function assertValid () {
        const stepExecutions = steps.map(step => step.execute);
        let chainedExecutions = Promise.resolve();

        stepExecutions.forEach(step => {
            chainedExecutions = chainedExecutions.then(step);
        });

        await chainedExecutions;
        steps.forEach((step, stepIndex) => {
            const util = require('util'),
                failureMessage = util.format(
                    '%s %s step %s failed; below is the actual result\n' +
                    '-----------\n' +
                    '%s\n' +
                    '-----------', endpoint, id, stepIndex + 1, step.actualResponse);

            step.assertValid(step.actualResponse, failureMessage);
        });
    }

    return { addStep, assertValid };
}

module.exports = { create };
