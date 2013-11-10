'use strict';

var assert = require('assert'),
    Q = require('./fakeQ'),
    mock = require('../mock').mock;

describe('fakeQ', function () {

    var deferred,
        promise;

    beforeEach(function () {
        deferred = Q.defer();
        promise = deferred.promise;
    });

    describe('#resolve', function () {
        it('should synchronously call callback with resolved value', function () {
            var callback = mock();

            deferred.resolve('success');
            promise.then(callback);

            assert.ok(callback.wasCalledWith('success'), callback.message());
        });

        it('should not call errback', function () {
            var errback = mock();

            deferred.resolve();
            promise.then(mock(), errback);

            assert.ok(!errback.wasCalled());
        });

        it('should return new promise when no promise returned from callback', function () {
            var callback = mock();

            deferred.resolve();
            promise.then(mock().returns('value')).then(callback);

            assert.ok(callback.wasCalledWith('value'), callback.message());
        });

        it('should return callback result if it already is a promise', function () {
            var callback = mock();

            deferred.resolve();
            promise.then(function () {
                var secondDeferred = Q.defer();
                secondDeferred.resolve('second');
                return secondDeferred.promise;
            }).then(callback);

            assert(callback.wasCalledWith('second'), callback.message());
        });

        it('should call callback only after resolution', function () {
            var callOrder = [];

            promise.then(function () {
                callOrder.push(2);
            });
            callOrder.push(1);
            deferred.resolve();

            assert.deepEqual(callOrder, [1, 2]);
        });
    });

    describe('#reject', function () {
        it('should synchronously call errback', function () {
            var errback = mock();

            deferred.reject('error');
            promise.then(mock(), errback);

            assert.ok(errback.wasCalledWith('error'), errback.message());
        });

        it('should not call callback', function () {
            var callback = mock();

            deferred.reject();
            promise.then(callback, mock());

            assert.ok(!callback.wasCalled());
        });

        it('should call errback only after rejection', function () {
            var callOrder = [];

            promise.then(mock(), function () {
                callOrder.push(2);
            });
            callOrder.push(1);
            deferred.reject();

            assert.deepEqual(callOrder, [1, 2]);
        });

        it('should propagate errback to final then call', function () {
            var errback = mock();

            deferred.reject();
            promise.then(mock()).then(mock(), errback);

            assert.ok(errback.wasCalled());
        });
    });
});
