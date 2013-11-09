'use strict';

function mock() {
    var wasCalled = false,
        actualArguments = [],
        message = '',
        slice = Array.prototype.slice,
        retVal = null;

    function setMessage (expected, actual) {
        message = '\nExpected call with ' + expected;
        if (wasCalled) {
            message += '\nActual called with ' + actual;
        }
        else {
            message += '\nNever called';
        }
    }

    function stubFunction () {
        wasCalled = true;
        actualArguments = slice.call(arguments);
        return retVal;
    }

    stubFunction.returns = function (value) {
        retVal = value;
        return stubFunction;
    };

    stubFunction.wasCalled = function () {
        return wasCalled;
    };

    stubFunction.wasCalledWith = function () {
        var expected = slice.call(arguments);
        setMessage(expected, actualArguments);
        return wasCalled &&
            JSON.stringify(actualArguments) === JSON.stringify(expected);
    };

    stubFunction.message = function () {
        return message;
    };

    return stubFunction;
}

module.exports = {
    mock: mock
};
