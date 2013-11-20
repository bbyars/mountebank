'use strict';

function satisfies (fieldName, expected, request, predicate) {
    var actual = request[fieldName];
    if (typeof expected === 'string') {
        return predicate(actual, expected);
    }
    else if (typeof expected === 'object') {
        // for header predicates
        return Object.keys(expected).every(function (key) {
            return actual[key] && satisfies('fieldName', expected[key], { fieldName: actual[key] }, predicate);
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
    matches: create(function (actual, expected) { return new RegExp(expected).test(actual); })
};
