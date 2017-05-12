'use strict';

var api = require('../../api/api').create(),
    jsdom = require('jsdom'),
    DocsTestScenario = require('./docsTestScenario'),
    Q = require('q');

/**
 * All DOM parsing happens here, including processing the special HTML tags
 */

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

function processText (element) {
    if (element.textContent.indexOf('http://origin-server.com') >= 0) {
        var replacements = element.getElementsByTagName('change');
        for (var i = 0; i < replacements.length; i += 1) {
            replacements[i].textContent = getAttribute(replacements[i], 'to');
        }
    }
    return element.textContent.trim();
}

// function processChangeCommands (element, accumulator) {
//    var replacements = element.getElementsByTagName('change');
//
//    accumulator.replacements = [];
//    for (var i = 0; i < replacements.length; i += 1) {
//        accumulator.replacements.push({
//            from: replacements[i].textContent,
//            to: getAttribute(replacements[i], 'to')
//        });
//        replacements[i].textContent = getAttribute(replacements[i], 'to');
//    }
// }
//
// function processIgnoreCommands (element, accumulator) {
//    var ignores = element.getElementsByTagName('ignore');
//
//    accumulator.jsonpathsToIgnore = [];
//    for (var i = 0; i < ignores.length; i += 1) {
//        result.jsonpathsToIgnore.push(getAttribute(ignores[i], 'jsonpath'));
//        ignores[i].textContent = '';
//    }
// }
//
// function process (element) {
//    var result = {};
//    processChangeCommands(element, result);
//    processIgnoreCommands(element, result);
//    result.text = element.textContent.trim();
//    return result;
// }

function get (endpoint) {
    var deferred = Q.defer();

    getDOM(endpoint).done(function (window) {
        var elements = window.document.getElementsByTagName('code'),
            tests = {};

        for (var i = 0; i < elements.length; i += 1) {
            var element = elements[i],
                testId = getAttribute(element, 'data-test-id'),
                stepSpec = {
                    stepId: getAttribute(element, 'data-test-step'),
                    testType: getAttribute(element, 'data-test-type'),
                    verifyStepId: getAttribute(element, 'data-test-verify-step'),
                    ignoreLines: getAttribute(element, 'data-test-ignore-lines'),
                    text: processText(element),
                    port: getAttribute(element, 'data-test-port'),
                    filename: getAttribute(element, 'data-test-filename'),
                    replacePattern: getAttribute(element, 'data-test-replace-pattern'),
                    replaceWith: getAttribute(element, 'data-test-replace-with')
                };

            if (testId) {
                if (!tests[testId]) {
                    tests[testId] = DocsTestScenario.create(endpoint, testId);
                }
                tests[testId].addStep(stepSpec);
            }
        }
        deferred.resolve(tests);
    });
    return deferred.promise;
}

module.exports = {
    get: get
};
