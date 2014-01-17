'use strict';

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q');

function create (proxy, postProcess) {
    /* jshint unused: false */
    var injectState = {};

    function inject (request, fn, logger) {
        /* jshint evil: true */
        var deferred = Q.defer(),
            scope = helpers.clone(request),
            injected = '(' + fn + ')(scope, injectState, logger, deferred.resolve);';

        try {
            var response = eval(injected);
            if (typeof response !== "undefined") {
                deferred.resolve(response);
            }
        }
        catch (error) {
            logger.error("injection X=> " + error);
            logger.error("    full source: " + JSON.stringify(injected));
            logger.error("    scope: " + JSON.stringify(scope));
            logger.error("    injectState: " + JSON.stringify(injectState));
            deferred.reject(errors.InjectionError('invalid response injection', { source: injected, data: error.message }));
        }
        return deferred.promise;
    }

    function predicatesFor (request, fieldsToMatch) {
//        console.log('predicatesFor:');
//        console.log('request: ' + JSON.stringify(request));
//        console.log('fieldsToMatch: ' + JSON.stringify(fieldsToMatch));
        var result = {};
        Object.keys(fieldsToMatch || {}).forEach(function (key) {
            if (typeof request[key] === 'object') {
                var subMatchers = {};

                if (fieldsToMatch[key].matches === true) {
                    Object.keys(request[key]).forEach(function (key) {
                        subMatchers[key] = { matches: true };
                    });
                    result[key] = predicatesFor(request[key], subMatchers);
                }
                else {
                    result[key] = predicatesFor(request[key], fieldsToMatch[key]);
                }
            }
            else {
                result[key] = { is: request[key] };
            }
        });
        return result;
    }

    function stubIndexFor (stubResolver, stubs) {
        for (var i = 0; i < stubs.length; i++) {
            var stub = stubs[i];
            if (stub.responses.indexOf(stubResolver) >= 0) {
                break;
            }
        }
        return i;
    }

    function getResolvePromise (stubResolver, request, logger, stubs) {
        if (stubResolver.is) {
            return Q(stubResolver.is);
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy.to, request).then(function (response) {
                var predicates = predicatesFor(request, stubResolver.proxy.replayWhen),
                    stubResponse = { is: response },
                    newStub = { predicates: predicates, responses: [stubResponse] },
                    index = stubIndexFor(stubResolver, stubs);

                if (['proxyOnce', 'proxyAlways'].indexOf(stubResolver.proxy.mode) < 0) {
                    stubResolver.proxy.mode = 'proxyOnce';
                }

                if (stubResolver.proxy.mode === 'proxyAlways') {
                    for (index = index + 1; index < stubs.length; index++) {
                        if (JSON.stringify(predicates) === JSON.stringify(stubs[index].predicates)) {
                            stubs[index].responses.push(stubResponse);
                            return Q(response);
                        }
                    }
                }

                stubs.splice(index, 0, newStub);

                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, logger).then(function (response) {
                return Q(response);
            });
        }
        else {
            return Q.reject(errors.ValidationError('unrecognized stub resolver', { source: stubResolver }));
        }
    }

    function resolve (stubResolver, request, logger, stubs) {
        return getResolvePromise(stubResolver, request, logger, stubs).then(function (response) {
            return Q(postProcess(response));
        });
    }

    return {
        resolve: resolve
    };
}

module.exports = {
    create: create
};
