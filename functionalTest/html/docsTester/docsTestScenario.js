'use strict';

const Q = require('q');

function create (endpoint, id) {
    const steps = [];

    function addStep (stepSpec) {
        const step = {
            assertValid: stepSpec.assertValid,
            execute: () => {
                const runner = require(`./testTypes/${stepSpec.type}`);
                return runner.runStep(stepSpec).then(actualResponse => {
                    step.actualResponse = actualResponse;
                    return Q(true);
                });
            }
        };

        steps.push(step);
    }

    function assertValid () {
        const stepExecutions = steps.map(step => step.execute),
            chainedExecutions = stepExecutions.reduce(Q.when, Q());

        return chainedExecutions.then(() => {
            steps.forEach((step, stepIndex) => {
                const util = require('util'),
                    failureMessage = util.format(
                        '%s %s step %s failed; below is the actual result\n' +
                        '-----------\n' +
                        '%s\n' +
                        '-----------', endpoint, id, stepIndex + 1, step.actualResponse);

                step.assertValid(step.actualResponse, failureMessage);
            });
        });
    }

    return { addStep, assertValid };
}

module.exports = { create };
