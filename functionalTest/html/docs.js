'use strict';

var api = require('../api/api'),
    jsdom = require('jsdom'),
    Q = require('q'),
    exec = require('./testTypes/exec');

function getDOM (endpoint) {
    var deferred = Q.defer(),
        url = api.url + endpoint;

    jsdom.env(url, function (errors, window) {
        if (errors) {
            deferred.reject(errors);
        }
        else {
            deferred.resolve(window);
        }
    });
    return deferred.promise;
}

function getAttribute (element, attributeName) {
    var attribute = element.attributes[attributeName];
    return attribute ? attribute.value : '';
}

function addStep (test, stepSpec) {
    /* jshint maxcomplexity: 8 */
    var stepIndex = (stepSpec.stepId || stepSpec.verifyStepId || 0) - 1;

    if (stepIndex < 0) {
        return;
    }

    if (!test.steps[stepIndex]) {
        test.steps[stepIndex] = { id: stepIndex + 1, ignoreLines: [] };
    }
    if (stepSpec.stepId) {
        test.steps[stepIndex].execute = test.addReplacementsTo(stepSpec.text);
    }
    if (stepSpec.verifyStepId) {
        test.steps[stepIndex].verify = test.addReplacementsTo(stepSpec.text);

        if (stepSpec.ignoreLines) {
            test.steps[stepIndex].ignoreLines = JSON.parse(stepSpec.ignoreLines);
        }
    }
}

function createTestSpec (id, testSpec) {
    return {
        name: id,
        type: testSpec.testType,
        steps: [],
        addReplacementsTo: function (text) {
            var pattern = new RegExp(testSpec.replacePattern, 'g'),
                substitution = testSpec.replaceWith.replace('${port}', api.port);
            return text.replace(pattern, substitution);
        },
        execute: function () {
            switch (this.type) {
                case 'exec':
                    return exec.getExecutedDocs(this);
                default:
                    throw Error('unrecognized or missing test type: ' + this.type);
            }
        }
    };
}

function get (endpoint) {
    var deferred = Q.defer();

    getDOM(endpoint).done(function (window) {
        var elements = window.document.getElementsByTagName('code'),
            tests = {};

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i],
                testId = getAttribute(element, 'data-test-id'),
                testSpec = {
                    testType: getAttribute(element, 'data-test-type'),
                    replacePattern: getAttribute(element, 'data-test-replace-pattern'),
                    replaceWith: getAttribute(element, 'data-test-replace-with')
                },
                stepSpec = {
                    stepId: getAttribute(element, 'data-test-step'),
                    verifyStepId: getAttribute(element, 'data-test-verify-step'),
                    ignoreLines: getAttribute(element, 'data-test-ignore-lines'),
                    text: element.textContent.trim()
                };

            if (testId) {
                if (!tests[testId]) {
                    tests[testId] = createTestSpec(testId, testSpec);
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
