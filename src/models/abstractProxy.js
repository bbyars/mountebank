'use strict';

var Q = require('q'),
    errors = require('../util/errors');

function implement (logger, implementation) {
    function to (proxyDestination, originalRequest) {

        function log (direction, what) {
            var format = direction === '=>' ? implementation.formatRequest : implementation.formatResponse;

            logger.debug('Proxy %s %s %s %s %s',
                originalRequest.requestFrom, direction, JSON.stringify(format(what)),
                direction, implementation.formatDestination(proxyDestination));
        }

        var deferred = Q.defer(),
            proxiedRequest = implementation.setupProxy(proxyDestination, originalRequest);

        log('=>', originalRequest);

        implementation.proxy(proxiedRequest).done(function (response) {
            log('<=', response);
            deferred.resolve(response);
        });

        proxiedRequest.once('error', function (error) {
            if (error.code === 'ENOTFOUND') {
                deferred.reject(errors.InvalidProxyError('Cannot resolve ' + JSON.stringify(proxyDestination)));
            }
            else if (error.code === 'ECONNREFUSED') {
                deferred.reject(errors.InvalidProxyError('Unable to connect to ' + JSON.stringify(proxyDestination)));
            }
            else {
                deferred.reject(error);
            }
        });

        return deferred.promise;
    }

    return {
        to: to
    };
}

module.exports = {
    implement: implement
};
