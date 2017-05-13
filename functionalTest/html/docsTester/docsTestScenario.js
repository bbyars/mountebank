'use strict';

var assert = require('assert'),
    Q = require('q');

function create (endpoint, id) {
    var steps = [];

    function addRequestFunctionsTo (step, stepSpec) {
        step.assertValid = function () {};
        step.execute = function () {
            var runner = require('./testTypes/' + stepSpec.type);
            return runner.runStep(stepSpec).then(function (actualResponse) {
                step.actualResponse = actualResponse;
                return Q(true);
            });
        };
    }

    function containsResponseAssertion (stepSpec) {
        return typeof stepSpec.expectedResponse === 'string';
    }

    function addResponseAssertionFunctionsTo (step, stepSpec) {
        var stepIndex = steps.length + 1;
        step.assertValid = function () {
            var actual = stepSpec.normalize(step.actualResponse),
                expected = stepSpec.normalize(stepSpec.expectedResponse);

            if (actual !== expected) {
                console.log('%s %s step %s failed; below is the actual result', endpoint, id, stepIndex);
                console.log('-----------');
                console.log(step.actualResponse);
                console.log('-----------');
            }
            assert.strictEqual(actual, expected);
        };
    }

    function addStep (stepSpec) {
        var step = {};
        addRequestFunctionsTo(step, stepSpec);

        if (containsResponseAssertion(stepSpec)) {
            addResponseAssertionFunctionsTo(step, stepSpec);
        }
        steps.push(step);
    }

    function assertValid () {
        var stepExecutions = steps.map(function (step) { return step.execute; }),
            chainedExecutions = stepExecutions.reduce(Q.when, Q());

        return chainedExecutions.then(function () {
            steps.forEach(function (step) {
                step.assertValid();
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
