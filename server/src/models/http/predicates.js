'use strict';

function is (fieldName, expected, request) {
    var actual = request[fieldName];
    if (typeof expected === 'string') {
        return actual.toLowerCase() === expected.toLowerCase();
    }
    else if (typeof expected === 'object') {
        return Object.keys(expected).every(function (key) {
            return actual[key] && (actual[key].toLowerCase() === expected[key].toLowerCase());
        });
    }
    else {
        return true;
    }
}

module.exports = {
    is: is
};
