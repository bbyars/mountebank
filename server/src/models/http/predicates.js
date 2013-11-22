'use strict';

function satisfies (fieldName, expected, request, predicate) {
    var actual = request[fieldName];
    if (['string', 'boolean'].indexOf(typeof expected) >= 0) {
        return predicate(actual, expected);
    }
    else if (typeof expected === 'object') {
        // for header predicates
        return Object.keys(expected).every(function (key) {
            // node lower cases header keys
            if (expected[key] === false) {
                return !actual[key.toLowerCase()];
            }
            else {
                return (actual[key.toLowerCase()]) &&
                    satisfies('fieldName', expected[key], { fieldName: actual[key.toLowerCase()] }, predicate);
            }
        });
    }
    else {
        return false;
    }
}

function create (predicate) {
    return function (fieldName, expected, request) {
        return satisfies(fieldName, expected, request, predicate);
    };
}

module.exports = {
    is: create(function (actual, expected) { return actual.toLowerCase() === expected.toLowerCase(); }),
    contains: create(function (actual, expected) { return actual.toLowerCase().indexOf(expected.toLowerCase()) >= 0; }),
    startsWith: create(function (actual, expected) { return actual.toLowerCase().indexOf(expected.toLowerCase()) === 0; }),
    endsWith: create(function (actual, expected) { return actual.toLowerCase().indexOf(expected.toLowerCase(), actual.length - expected.length) >= 0; }),
    matches: create(function (actual, expected) { return new RegExp(expected).test(actual); }),
    exists: create(function (actual, expected) { return expected ? actual.length > 0 : actual.length === 0; })
};
