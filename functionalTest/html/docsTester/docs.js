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

function asArray (iterable) {
    var result = [];
    for (var i = 0; i < iterable.length; i += 1) {
        result.push(iterable[i]);
    }
    return result;
}

function subElements (parentElement, tagName) {
    return asArray(parentElement.getElementsByTagName(tagName)).map(function (element) {
        var attributes = {};
        element.getAttributeNames().forEach(function (attributeName) {
            attributes[attributeName] = element.attributes[attributeName].value;
        });

        return {
            subElements: function (subTagName) { return subElements(element, subTagName); },
            attributes: attributes,
            attributeValue: function (attributeName) {
                return attributes[attributeName] ? attributes[attributeName] : '';
            },
            text: function () {
                return element.textContent.trim();
            },
            setText: function (newText) {
                element.textContent = newText;
            }
        };
    });
}

/*
 * Allows you to show different data than what is actually needed for the test
 * Wrap it in <change to='replacement-value'>display-value</change>
 */
function processChangeCommands (element) {
    var codeElement = element.subElements('code')[0],
        substitutions = codeElement.subElements('change');
    substitutions.forEach(function (changeElement) {
        changeElement.setText(changeElement.attributeValue('to'));
    });
    return codeElement.text();
}
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

function normalizeJSON (possibleJSON) {
    try {
        return JSON.stringify(JSON.parse(possibleJSON), null, 2);
    }
    catch (e) {
        return possibleJSON;
    }
}

/*
 * Allows you to format the JSON however you want in the docs
 * This function ensures whitespace normalization
 */
function normalizeJSONSubstrings (text) {
    // [\S\s] because . doesn't match newlines
    var jsonPattern = /\{[\S\s]*\}/;
    if (jsonPattern.test(text)) {
        var prettyPrintedJSON = normalizeJSON(jsonPattern.exec(text)[0]);
        text = text.replace(jsonPattern, prettyPrintedJSON);
    }
    return text;
}

function lines (text) {
    return text.replace(/\r/g, '').split('\n');
}

function collectVolatileLines (responseElement) {
    var responseLines = lines(responseElement.text());

    return responseElement.subElements('volatile').map(function (volatileElement) {
        var index = responseLines.findIndex(function (line) {
                return line.indexOf(volatileElement.text()) >= 0;
            }),
            startOfPattern = '^' + responseLines[index].replace(/^\s+/, '\\s+'),
            pattern = startOfPattern.replace(volatileElement.text(), '(.+)') + '$';

        // Another volatile pattern may have the exact same data as this // one
        // (esp. with timestamps). Without removing, we'll miss the second line
        responseLines.splice(index, 1);

        return new RegExp(pattern);
    });
}

/*
 * Allows you to wrap volatile data in <volatile></volatile> tags. It will
 * not be compared. The volatile tags only work if opened and closed on the
 * same line. Comparisons are done by line to make the HTML read better:
 * you can have multiple volatile lines for the same logical pattern
 */
function replaceVolatileData (text, volatileLines) {
    return volatileLines.reduce(function (accumulator, volatileLinePattern) {
        var textLines = lines(accumulator),
            lineIndex = textLines.findIndex(function (line) {
                // Skip ones that have already been replaced
                return !/VOLATILE/.test(line) && volatileLinePattern.test(line);
            });

        if (lineIndex >= 0) {
            var matches = volatileLinePattern.exec(textLines[lineIndex]);
            textLines[lineIndex] = textLines[lineIndex].replace(matches[1], 'VOLATILE');
        }
        return textLines.join('\n');
    }, text);
}

function normalize (text, assertElement) {
    var normalizedJSON = normalizeJSONSubstrings(text || '');
    return replaceVolatileData(normalizedJSON, collectVolatileLines(assertElement)).trim();
}

/*
 * Each request is wrapped in a <step type='http'></step> tag
 * The step can accept other attributes needed for other types (e.g. filename)
 * If you want to validate the response for the request, add a
 * <assertResponse</assertResponse> tag around the response text
 */
function createStepSpecFrom (stepElement) {
    var stepSpec = stepElement.attributes,
        assertElements = stepElement.subElements('assertResponse');

    stepSpec.requestText = processChangeCommands(stepElement);
    if (assertElements.length > 0) {
        stepSpec.expectedResponse = processChangeCommands(assertElements[0]);
        stepSpec.normalize = function (text) {
            return normalize(text, stepElement, assertElements[0]);
        };
    }
    return stepSpec;
}

function createScenarioFrom (testElement, endpoint) {
    var scenarioName = testElement.attributeValue('name'),
        scenario = DocsTestScenario.create(endpoint, scenarioName);

    testElement.subElements('step').forEach(function (stepElement) {
        scenario.addStep(createStepSpecFrom(stepElement));
    });

    return scenario;
}

/*
 * Each scenario is wrapped in a <testScenario name='scenario-name></testScenario> tag
 */
function getScenarios (endpoint) {
    var deferred = Q.defer();

    getDOM(endpoint).done(function (window) {
        var testElements = subElements(window.document, 'testScenario'),
            testScenarios = {};

        testElements.forEach(function (testElement) {
            var scenarioName = testElement.attributeValue('name');
            testScenarios[scenarioName] = createScenarioFrom(testElement, endpoint);
        });
        deferred.resolve(testScenarios);
    });

    return deferred.promise;
}

module.exports = {
    getScenarios: getScenarios
};
