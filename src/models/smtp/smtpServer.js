'use strict';

/**
 * Represents an smtp imposter
 * @module
 */

function createServer () {
    var combinators = require('../../util/combinators'),
        inherit = require('../../util/inherit'),
        result = inherit.from(require('events').EventEmitter, {
            errorHandler: require('../../util/combinators').noop,
            formatRequestShort: function (request) {
                var util = require('util');
                return util.format('Envelope from: %s to: %s', request.from, JSON.stringify(request.to));
            },
            formatRequest: combinators.identity,
            formatResponse: combinators.noop,
            respond: function (smtpRequest, originalRequest) { originalRequest.accept(); },
            metadata: combinators.constant({}),
            addStub: combinators.noop,
            state: {},
            stubs: function () { return []; }
        }),
        requestHandler = function (request) {
            result.emit('request', { remoteAddress: request.remoteAddress }, request);
        },
        server = require('simplesmtp').createSimpleServer({ disableDNSValidation: true }, requestHandler);

    server.server.SMTPServer.on('connect', function (raiSocket) {
        result.emit('connection', raiSocket.socket);
    });

    result.close = function (callback) {
        server.server.end(combinators.noop);
        callback();
    };

    result.listen = function (port) {
        /* eslint-disable no-underscore-dangle */
        var Q = require('q'),
            deferred = Q.defer();

        server.listen(port, function () {
            deferred.resolve(server.server.SMTPServer._server.address().port);
        });
        return deferred.promise;
    };

    return result;
}

/**
 * Initializes the smtp protocol
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object}
 */
function initialize (recordRequests, debug) {
    var implementation = {
            protocolName: 'smtp',
            createServer: createServer,
            Request: require('./smtpRequest')
        },
        noOpValidator = {
            create: function () {
                return {
                    validate: function () {
                        var Q = require('q');
                        return Q({
                            isValid: true,
                            errors: []
                        });
                    }
                };
            }
        },
        logger = require('winston');

    return {
        name: implementation.protocolName,
        create: require('../abstractServer').implement(implementation, recordRequests, debug, logger).create,
        Validator: noOpValidator
    };
}

module.exports = {
    initialize: initialize
};
