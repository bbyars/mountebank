'use strict';

var Q = require('q'),
    api = require('../../api/api').create();

function create (endpoint, id) {
    var steps = [];

    function addStep (stepSpec) {
        var stepIndex = (stepSpec.stepId || stepSpec.verifyStepId || 0) - 1,
            addReplacementsTo = function (text) {
                var pattern = new RegExp(stepSpec.replacePattern, 'g'),
                    substitution = stepSpec.replaceWith.replace('${port}', api.port);
                return text.replace(pattern, substitution);
            };

        if (stepIndex < 0) {
            return;
        }

        if (!steps[stepIndex]) {
            steps[stepIndex] = {
                id: stepIndex + 1,
                type: stepSpec.testType,
                ignoreLines: [],
                port: stepSpec.port,
                execute: addReplacementsTo(stepSpec.text),
                filename: stepSpec.filename
            };
        }
        if (stepSpec.verifyStepId) {
            steps[stepIndex].verify = addReplacementsTo(stepSpec.text);

            if (stepSpec.ignoreLines) {
                steps[stepIndex].ignoreLines = JSON.parse(stepSpec.ignoreLines);
            }
        }
    }

    function execute () {
        var stepExecutions = steps.map(function (step) {
                return function () {
                    try {
                        var executor = require('./testTypes/' + step.type);
                        return executor.runStep(step);
                    }
                    catch (e) {
                        console.log('Invalid step type:');
                        console.log(JSON.stringify(step, null, 4));
                        throw e;
                    }
                };
            }),
            that = this;

        return stepExecutions.reduce(Q.when, Q()).then(function () { return Q(that); });
    }

    return {
        endpoint: endpoint,
        name: id,
        steps: steps,
        addStep: addStep,
        execute: execute
    };
}

module.exports = {
    create: create
};
