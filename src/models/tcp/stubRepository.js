'use strict';

var Q = require('q'),
    util = require('util'),
    predicates = require('./predicates'),
    errors = require('../../errors/errors');

function create (proxy) {
    var stubs = [],
        injectState = {};

    function trueForAll (obj, predicate) {
        // we call map before calling every so we make sure to call every
        // predicate during dry run validation rather than short-circuiting
        return Object.keys(obj).map(predicate).every(function (result) { return result; });
    }

    function matchesPredicate (fieldName, predicate, request) {
        if (typeof predicate !== 'object' || util.isArray(predicate)) {
            throw errors.ValidationError('predicate must be an object', { source: predicate });
        }

        return trueForAll(predicate, function (key) {
            if (predicates[key]) {
                return predicates[key](fieldName, predicate[key], request);
            }
            else if (typeof predicate[key] === 'object') {
                return matchesPredicate(fieldName + '.' + key, predicate[key], request);
            }
            else {
                throw errors.ValidationError("no predicate '" + key + "'", { source: predicate });
            }
        });
    }

    function findFirstMatch (request) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var predicates = stub.predicates || {};
            return trueForAll(predicates, function (fieldName) {
                return matchesPredicate(fieldName, predicates[fieldName], request);
            });
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stub = findFirstMatch(request) || { responses: [{ is: { data: '' } }]},
            stubResolver = stub.responses.shift(),
            deferred = Q.defer();

        stub.responses.push(stubResolver);

        getResolvedResponsePromise(stubResolver, request).done(function (response) {
            var match = {
                timestamp: new Date().toJSON(),
                request: request,
                response: response
            };
            stub.matches = stub.matches || [];
            stub.matches.push(match);
            deferred.resolve(response);
        }, function (reason) {
            deferred.reject(reason);
        });

        return deferred.promise;
    }

    function getResolvedResponsePromise (stubResolver, request) {
        if (stubResolver.is) {
            return Q(stubResolver.is);
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy, request);
        }
        else if (stubResolver.proxyOnce) {
            return proxy.to(stubResolver.proxyOnce, request).then(function (response) {
                stubResolver.is = response;
                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, injectState).then(function (response) {
                return Q(response);
            });
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized stub resolver', { source: stubResolver }));
        }
    }

    function inject (request, fn, state) {
        /* jshint evil: true, unused: false */
        var deferred = Q.defer(),
            scope = JSON.parse(JSON.stringify(request)),
            callback = function (response) { deferred.resolve(response);},
            injected = 'try {\n' +
                '    var response = (' + fn + ')(scope, state, callback);\n' +
                '    if (response) { callback(response); }\n' +
                '}\n' +
                'catch (error) {\n' +
                '    deferred.reject(error);\n' +
                '}';
        eval(injected);
        return deferred.promise;
    }

    return {
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};
