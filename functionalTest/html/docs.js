'use strict';

var api = require('../api/api'),
    jsdom = require('jsdom'),
    Q = require('q');

function getDOM (endpoint) {
    var deferred = Q.defer(),
        url = api.url + endpoint;

    jsdom.env({
        url: url,
        done: function (errors, window) {
            if (errors) {
                deferred.reject(errors);
            }
            else {
                deferred.resolve(window);
            }
        }
    });
    return deferred.promise;
}

function getAttribute (element, attributeName) {
    var attribute = element.attributes[attributeName];
    return attribute ? attribute.value : '';
}

function addStep (test, stepSpec) {
    var stepIndex = (stepSpec.stepId || stepSpec.verifyStepId || 0) - 1;

    if (stepIndex < 0) {
        return;
    }

    if (!test.steps[stepIndex]) {
        test.steps[stepIndex] = {
            id: stepIndex + 1,
            type: stepSpec.testType,
            ignoreLines: [],
            port: stepSpec.port,
            execute: test.addReplacementsTo(stepSpec.text)
        };
    }
    if (stepSpec.verifyStepId) {
        test.steps[stepIndex].verify = test.addReplacementsTo(stepSpec.text);

        if (stepSpec.ignoreLines) {
            test.steps[stepIndex].ignoreLines = JSON.parse(stepSpec.ignoreLines);
        }
    }
}

function createTestSpec (endpoint, id, testSpec) {
    return {
        endpoint: endpoint,
        name: id,
        steps: [],
        addReplacementsTo: function (text) {
            var pattern = new RegExp(testSpec.replacePattern, 'g'),
                substitution = testSpec.replaceWith.replace('${port}', api.port);
            return text.replace(pattern, substitution);
        },
        execute: function () {
            var steps = this.steps.map(function (step) {
                    return function () {
                        var executor = require('./testTypes/' + step.type);
                        return executor.runStep(step);
                    };
                }),
                that = this;

            return steps.reduce(Q.when, Q()).then(function () { return Q(that); });
        }
    };
}

function get (endpoint) {
    var deferred = Q.defer();

    getDOM(endpoint).done(function (window) {
        var elements = window.document.getElementsByTagName('code'),
            tests = {};

        for (var i = 0; i < elements.length; i += 1) {
            var element = elements[i],
                testId = getAttribute(element, 'data-test-id'),
                testSpec = {
                    replacePattern: getAttribute(element, 'data-test-replace-pattern'),
                    replaceWith: getAttribute(element, 'data-test-replace-with')
                },
                stepSpec = {
                    stepId: getAttribute(element, 'data-test-step'),
                    testType: getAttribute(element, 'data-test-type'),
                    verifyStepId: getAttribute(element, 'data-test-verify-step'),
                    ignoreLines: getAttribute(element, 'data-test-ignore-lines'),
                    text: element.textContent.trim(),
                    port: getAttribute(element, 'data-test-port')
                };

            if (testId) {
                if (!tests[testId]) {
                    tests[testId] = createTestSpec(endpoint, testId, testSpec);
                }
                addStep(tests[testId], stepSpec);
            }
        }
        deferred.resolve(tests);
    });
    return deferred.promise;
}

module.exports = {
    get: get
};
