'use strict';

function mock () {
    let wasCalled = false,
        actualArguments = [],
        message = '',
        slice = Array.prototype.slice,
        retVal;

    function setMessage (expected, actual) {
        message = '\nExpected call with ' + JSON.stringify(expected);
        if (wasCalled) {
            message += '\nActual called with ' + JSON.stringify(actual);
        }
        else {
            message += '\nActually never called';
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

    stubFunction.wasCalled = () => wasCalled;

    stubFunction.wasCalledWith = () => {
        const expected = slice.call(arguments),
            actual = actualArguments.slice(0, expected.length); // allow matching only first few params
        setMessage(expected, actualArguments);

        return wasCalled && JSON.stringify(actual) === JSON.stringify(expected);
    };

    stubFunction.message = () => message;

    return stubFunction;
}

module.exports = {
    mock: mock
};
