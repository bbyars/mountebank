'use strict';

var Q = require('q');

function create (endpoint, id) {
    var steps = [];

    function addStep (stepSpec) {
        var step = {
            assertValid: stepSpec.assertValid,
            execute: () => {
                var runner = require('./testTypes/' + stepSpec.type);
                return runner.runStep(stepSpec).then(function (actualResponse) {
                    step.actualResponse = actualResponse;
                    return Q(true);
                });
            }
        };

        steps.push(step);
    }

    function assertValid () {
        var stepExecutions = steps.map(function (step) { return step.execute; }),
            chainedExecutions = stepExecutions.reduce(Q.when, Q());

        return chainedExecutions.then(() => {
            steps.forEach(function (step, stepIndex) {
                var util = require('util'),
                    failureMessage = util.format(
                        '%s %s step %s failed; below is the actual result\n' +
                        '-----------\n' +
                        '%s\n' +
                        '-----------', endpoint, id, stepIndex + 1, step.actualResponse);

                step.assertValid(step.actualResponse, failureMessage);
            });
        });
    }

    return {
        addStep: addStep,
        assertValid: assertValid
    };
}

module.exports = {
    create: create
};
