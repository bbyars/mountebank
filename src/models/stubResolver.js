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
            injected = 'try {\n' +
                       '    var response = (' + fn + ')(scope, injectState, deferred.resolve);\n' +
                       '    if (typeof response !== "undefined") { deferred.resolve(response); }\n' +
                       '}\n' +
                       'catch (error) {\n' +
                       '    logger.error("injection X=> " + error);\n' +
                       '    logger.error("    source: " + JSON.stringify(fn));\n' +
                       '    logger.error("    scope: " + JSON.stringify(scope));\n' +
                       '    logger.error("    state: " + JSON.stringify(injectState));\n' +
                       '    deferred.reject(error);\n' +
                       '}';
        eval(injected);
        return deferred.promise;
    }

    function addPredicatesTo (predicates, request, predicatesToRemember) {
        predicatesToRemember.forEach(function (key) {
            if (key.indexOf('.') > 0) {
                var parts = key.split('.'),
                    next = parts[0],
                    rest = parts.slice(1).join('.');
                predicates[next] = {};
                addPredicatesTo(predicates[next], request[next], [rest]);
            }
            else if (typeof request[key] === 'object') {
                predicates[key] = {};
                addPredicatesTo(predicates[key], request[key], Object.keys(request[key]));
            }
            else {
                predicates[key] = { is: request[key] };
            }
        });
    }

    function getResolvePromise (stubResolver, request, logger, stubs) {
        /* jshint maxcomplexity: 6 */
        if (stubResolver.is) {
            return Q(stubResolver.is);
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy.to, request);
        }
        else if (stubResolver.proxyOnce) {
            return proxy.to(stubResolver.proxyOnce.to, request).then(function (response) {
                stubResolver.is = response;
                return Q(response);
            });
        }
        else if (stubResolver.proxyAll) {
            return proxy.to(stubResolver.proxyAll.to, request).then(function (response) {
                var stub = { predicates: {}, responses: [{ is: response }] };
                addPredicatesTo(stub.predicates, request, stubResolver.proxyAll.remember);
                stubs.unshift(stub);
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
