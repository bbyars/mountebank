'use strict';

const api = require('../../api/api').create(),
    JSDOM = require('jsdom').JSDOM,
    DocsTestScenario = require('./docsTestScenario'),
    Q = require('q'),
    assert = require('assert');

/**
 * All DOM parsing happens here, including processing the special HTML tags
 */

function getDOM (endpoint) {
    const deferred = Q.defer(),
        url = api.url + endpoint;

    JSDOM.fromURL(url).then(dom => {
        deferred.resolve(dom.window);
    }).catch(errors => {
        deferred.reject(errors);
    });

    return deferred.promise;
}

function asArray (iterable) {
    const result = [];
    for (let i = 0; i < iterable.length; i += 1) {
        result.push(iterable[i]);
    }
    return result;
}

function subElements (parentElement, tagName) {
    return asArray(parentElement.getElementsByTagName(tagName)).map(element => {
        const attributes = {};
        element.getAttributeNames().forEach(attributeName => {
            attributes[attributeName] = element.attributes[attributeName].value;
        });

        return {
            subElements: subTagName => subElements(element, subTagName),
            attributes: attributes,
            attributeValue: attributeName => attributes[attributeName] || '',
            text: () => element.textContent.trim(),
            setText: newText => {
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
    const codeElement = element.subElements('code')[0],
        substitutions = codeElement.subElements('change');
    substitutions.forEach(changeElement => {
        changeElement.setText(changeElement.attributeValue('to'));
    });
    return codeElement.text();
}

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
    const jsonPattern = /\{[\S\s]*\}/;
    if (jsonPattern.test(text)) {
        const prettyPrintedJSON = normalizeJSON(jsonPattern.exec(text)[0]);
        text = text.replace(jsonPattern, prettyPrintedJSON);
    }
    return text;
}

function linesOf (text) {
    return text.replace(/\r/g, '').split('\n');
}

function collectVolatileLines (responseElement) {
    const responseLines = linesOf(responseElement.text());

    return responseElement.subElements('volatile').map(volatileElement => {
        const index = responseLines.findIndex(line => line.indexOf(volatileElement.text()) >= 0),
            startOfPattern = `^${responseLines[index].replace(/^\s+/, '\\s+')}`,
            pattern = `${startOfPattern.replace(volatileElement.text(), '(.+)')}$`;

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
    return volatileLines.reduce((accumulator, volatileLinePattern) => {
        const textLines = linesOf(accumulator),
            // Skip ones that have already been replaced
            lineIndex = textLines.findIndex(line => !/VOLATILE/.test(line) && volatileLinePattern.test(line));
        if (lineIndex >= 0) {
            const matches = volatileLinePattern.exec(textLines[lineIndex]);
            textLines[lineIndex] = textLines[lineIndex].replace(matches[1], 'VOLATILE');
        }
        return textLines.join('\n');
    }, text);
}

function normalize (text, responseElement) {
    const trimmed = (text || '').trim(),
        normalizedJSON = normalizeJSONSubstrings(trimmed),
        normalizedVolatility = replaceVolatileData(normalizedJSON, collectVolatileLines(responseElement));

    return normalizedVolatility;
}

function isPartialComparison (responseElement) {
    return responseElement.attributeValue('partial') === 'true';
}

function setDifference (partialExpectedLines, actualLines) {
    const difference = [];
    let lastIndex = -1;

    // Track index in closure to ensure two equivalent lines in partialExpected don't match
    // the same line in actual. The lines have to match in order.
    partialExpectedLines.forEach((expectedLine, index) => {
        const matchedIndex = actualLines.findIndex((actualLine, matchIndex) =>
            // Allow comma at end because the actual JSON could include additional elements we don't care about
            matchIndex > lastIndex &&
                (expectedLine.trim() === actualLine.trim() || `${expectedLine.trim()},` === actualLine.trim()));
        if (matchedIndex < 0) {
            difference.push({
                index: index,
                missingLine: expectedLine,
                previous: partialExpectedLines.slice(Math.max(0, index - 10), index).join('\n'),
                next: partialExpectedLines.slice(index + 1, Math.min(partialExpectedLines.length - 1, index + 5)).join('\n')
            });
        }
        else {
            lastIndex = matchedIndex;
        }
    });

    return difference;
}

/*
 * Each request is wrapped in a <step type='http'></step> tag
 * The step can accept other attributes needed for other types (e.g. filename)
 * If you want to validate the response for the request, add a
 * <assertResponse</assertResponse> tag around the response text
 */
function createStepSpecFrom (stepElement) {
    const stepSpec = stepElement.attributes,
        responseElements = stepElement.subElements('assertResponse');

    stepSpec.requestText = processChangeCommands(stepElement);
    stepSpec.assertValid = () => {};

    if (responseElements.length > 0) {
        const responseElement = responseElements[0],
            expectedResponse = processChangeCommands(responseElement);

        stepSpec.assertValid = (actualResponse, failureMessage) => {
            const actual = normalize(actualResponse, responseElement),
                expected = normalize(expectedResponse, responseElement);

            if (isPartialComparison(responseElement)) {
                assert.deepEqual(setDifference(linesOf(expected), linesOf(actual)), [], failureMessage);
            }
            else {
                assert.strictEqual(actual, expected, failureMessage);
            }
        };
    }
    return stepSpec;
}

function createScenarioFrom (testElement, endpoint) {
    const scenarioName = testElement.attributeValue('name'),
        scenario = DocsTestScenario.create(endpoint, scenarioName);

    testElement.subElements('step').forEach(stepElement => {
        scenario.addStep(createStepSpecFrom(stepElement));
    });

    return scenario;
}

/*
 * Each scenario is wrapped in a <testScenario name='scenario-name></testScenario> tag
 */
function getScenarios (endpoint) {
    const deferred = Q.defer();

    getDOM(endpoint).done(window => {
        const testElements = subElements(window.document, 'testScenario'),
            testScenarios = {};

        testElements.forEach(testElement => {
            const scenarioName = testElement.attributeValue('name');
            testScenarios[scenarioName] = createScenarioFrom(testElement, endpoint);
        });
        deferred.resolve(testScenarios);
    });

    return deferred.promise;
}

module.exports = { getScenarios };
