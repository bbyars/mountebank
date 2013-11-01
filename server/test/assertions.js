'use strict';

var nodeunitTypes = require('nodeunit/lib/types'),
    nodeunitTest = nodeunitTypes.test;

var addCustomAsserts = function (test) {
    test.jsonEquals = function (actual, expected, message) {
        var json = function (obj) {
            if (typeof obj === 'string') {
                // Normalize whitespace
                return JSON.stringify(JSON.parse(obj));
            }
            else {
                return JSON.stringify(obj);
            }
        };

        message = message || 'JSON not equal\nExpected:\n' + json(expected) + '\n\nActual:\n' + json(actual);
        test.strictEqual(json(actual), json(expected), message);
    };

    test.notOk = function (actual, message) {
        test.ok(!actual, message);
    };

    test.wasCalled = function (mock) {
        if (arguments.length === 1) {
            test.ok(mock.wasCalled(), 'Expected mock call, none received.');
        }
        else {
            // assume withArgs result
            arguments[1](test, mock);
        }
    };

    test.matches = function (actual, expectedRegex, message) {
        message = message || 'Expected ' + actual + ' to match ' + expectedRegex;
        test.ok(expectedRegex.test(actual), message);
    };
};

nodeunitTypes.test = function () {
    var test = nodeunitTest.apply(this, arguments);
    addCustomAsserts(test);
    return test;
};
