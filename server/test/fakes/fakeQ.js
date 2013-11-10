'use strict';

function isPromise (value) {
    return value && typeof value.then === 'function';
}

function defer () {
    var isResolved = false,
        onResolve = function () {},
        resolvedValue,
        isRejected = false,
        onReject = function () {},
        rejectedReason,
        promise = {
            then: function (callback, errback) {
                errback = errback || function (reason) {
                    return reason;
                };

                onResolve = function () {
                    var value = callback(resolvedValue);

                    if (isPromise(value)) {
                        return value;
                    }
                    else {
                        var deferred = defer();
                        deferred.resolve(value);
                        return deferred.promise;
                    }
                };
                onReject = function () {
                    var value = errback(rejectedReason);

                    if (isPromise(value)) {
                        return value;
                    }
                    else {
                        var deferred = defer();
                        deferred.reject(value);
                        return deferred.promise;
                    }
                };

                if (isResolved) {
                    return onResolve();
                }
                else if (isRejected) {
                    return onReject();
                }
            }
        };

    function resolve (value) {
        resolvedValue = value;
        isResolved = true;
        onResolve();
    }

    function reject (reason) {
        rejectedReason = reason;
        isRejected = true;
        onReject();
    }

    return {
        promise: promise,
        resolve: resolve,
        reject: reject
    };
}

module.exports = {
    defer: defer
};
