'use strict';

var Q = require('./fakes/fakeQ');

function mock () {
    var wasCalled = false,
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

    stubFunction.returnsPromiseResolvingTo = function (value) {
        var deferred = Q.defer();
        deferred.resolve(value);
        retVal = deferred.promise;
        return stubFunction;
    };

    stubFunction.returnsPromiseRejection = function (reason) {
        var deferred = Q.defer();
        deferred.reject(reason);
        retVal = deferred.promise;
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
