'use strict';

var assert = require('assert'),
    api = require('../api/api'),
    jsdom = require('jsdom'),
    exec = require('child_process').exec,
    Q = require('q'),
    fs = require('fs'),
    promiseIt = require('../testHelpers').promiseIt,
    nextTestId = 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 3000);

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
        }
    };
}

function getTests (endpoint) {
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

function execute (command) {
    var deferred = Q.defer();

    exec(command, function (error, stdout) {
        if (error) {
            error.message += '\n\nwhen executing: ' + command;
            deferred.reject(error);
        }
        else {
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

function runStep (step) {
    var deferred = Q.defer(),
        filename = 'test-' + nextTestId;

    fs.writeFileSync(filename, step.execute, { mode: 484 /* 0744 */});
    nextTestId += 1;

    execute('bash ./' + filename).done(function (stdout) {
        step.result = stdout;
        fs.unlinkSync(filename);
        deferred.resolve(step);
    }, deferred.reject);

    return deferred.promise;
}

function getExecutedTests (testSpecs) {
    return Object.keys(testSpecs).map(function (testName) {
        var spec = testSpecs[testName],
            steps = spec.steps.map(function (step) {
                return function () { return runStep(step); };
            });

        return steps.reduce(Q.when, Q()).then(function () { return Q(spec); });
    });
}

function normalize (text, linesToIgnore) {
    text = (text || '').replace(/\r/g, '');
    linesToIgnore = linesToIgnore || [];

    var lines = text.split('\n'),
        result = [];

    lines.forEach(function (line) {
        if (!linesToIgnore.some(function (pattern) {
            return new RegExp(pattern).test(line);
        })) {
            result.push(line);
        }
    });

    return result.join('\n').trim();
}

describe('docs', function () {
    this.timeout(timeout);

    var pages = ['/docs/gettingStarted'];

    pages.forEach(function (page) {
        promiseIt(page + ' should be up-to-date', function () {
            return getTests(page).then(getExecutedTests).then(function (tests) {
                return tests[0];
            }).then(function (spec) {
                for (var i = 0; i < spec.steps.length; i++) {
                    var step = spec.steps[i],
                        actual = normalize(step.result, step.ignoreLines),
                        expected = normalize(step.verify, step.ignoreLines);

                    if (step.verify) {
                        assert.strictEqual(actual, expected);
                    }
                }
            });
        });
    });
});
