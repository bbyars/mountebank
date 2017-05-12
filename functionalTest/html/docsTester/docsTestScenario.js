'use strict';

var assert = require('assert'),
    Q = require('q'),
    api = require('../../api/api').create();

function create (endpoint, id) {
    var steps = [];

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

    function ignoreLine (line, linesToIgnore) {
        return (linesToIgnore || []).some(function (pattern) {
            return new RegExp(pattern).test(line);
        });
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

    // TODO: Add steps automatically with <step><execute><code></code></execute><verify></verify></step>
    // Get rid of step-index declaration
    function addStep (stepSpec) {
        var stepIndex = (stepSpec.stepId || stepSpec.verifyStepId || 0) - 1,
            addReplacementsTo = function (text) {
                var pattern = new RegExp(stepSpec.replacePattern, 'g'),
                    substitution = stepSpec.replaceWith.replace('${port}', api.port);
                return text.replace(pattern, substitution);
            },
            step = steps[stepIndex];

        if (!step) {
            step = {
                port: stepSpec.port,
                text: addReplacementsTo(stepSpec.text),
                filename: stepSpec.filename,
                assertValid: function () { return true; },
                execute: function () {
                    try {
                        var executor = require('./testTypes/' + stepSpec.testType);
                        return executor.runStep(step);
                    }
                    catch (e) {
                        console.log(e);
                        console.log('Invalid step type: ' + stepSpec.testType);
                        throw e;
                    }
                }
            };
            steps[stepIndex] = step;
        }
        if (stepSpec.verifyStepId) {
            var expectedText = addReplacementsTo(stepSpec.text);

            if (stepSpec.ignoreLines) {
                steps[stepIndex].ignoreLines = JSON.parse(stepSpec.ignoreLines);
            }
            step.assertValid = function () {
                var actual = normalize(step.result, step.ignoreLines),
                    expected = normalize(expectedText, step.ignoreLines);

                if (actual !== expected) {
                    console.log('%s %s step %s failed; below is the actual result', endpoint, id, stepIndex + 1);
                    console.log(normalize(step.result));
                }
                assert.strictEqual(actual, expected);
            };
        }
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
