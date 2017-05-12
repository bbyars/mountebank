'use strict';

var assert = require('assert'),
    Q = require('q'),
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
                text: addReplacementsTo(stepSpec.text),
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
        });

        return stepExecutions.reduce(Q.when, Q());
    }

    function ignoreLine (line, linesToIgnore) {
        return (linesToIgnore || []).some(function (pattern) {
            return new RegExp(pattern).test(line);
        });
    }

    function normalizeJSON (possibleJSON) {
        try {
            return JSON.stringify(JSON.parse(possibleJSON), null, 2);
        }
        catch (e) {
            return possibleJSON;
        }
    }

    function normalizeJSONSubstrings (text) {
        // [\S\s] because . doesn't match newlines
        var jsonPattern = /\{[\S\s]*\}/;
        if (jsonPattern.test(text)) {
            var prettyPrintedJSON = normalizeJSON(jsonPattern.exec(text)[0]);
            text = text.replace(jsonPattern, prettyPrintedJSON);
        }
        return text;
    }

    function normalize (text, linesToIgnore) {
        var jsonNormalized = normalizeJSONSubstrings(text || ''),
            lines = jsonNormalized.replace(/\r/g, '').split('\n'),
            result = [];

        lines.forEach(function (line) {
            if (!ignoreLine(line, linesToIgnore)) {
                result.push(line);
            }
        });

        return result.join('\n').trim();
    }

    function assertValid () {
        return execute().then(function () {
            steps.forEach(function (step) {
                if (step.verify) {
                    var actual = normalize(step.result, step.ignoreLines),
                        expected = normalize(step.verify, step.ignoreLines);

                    if (actual !== expected) {
                        console.log('%s %s step %s failed; below is the actual result', endpoint, id, step.id);
                        console.log(normalize(step.result));
                    }
                    assert.strictEqual(actual, expected);
                }
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
