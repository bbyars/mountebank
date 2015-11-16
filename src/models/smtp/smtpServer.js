'use strict';

/**
 * Represents an smtp imposter
 * @module
 */

var AbstractServer = require('../abstractServer'),
    smtp = require('simplesmtp'),
    Q = require('q'),
    logger = require('winston'),
    inherit = require('../../util/inherit'),
    combinators = require('../../util/combinators'),
    util = require('util'),
    events = require('events'),
    SmtpRequest = require('./smtpRequest');

function createServer () {
    var result = inherit.from(events.EventEmitter, {
            errorHandler: combinators.noop,
            formatRequestShort: function (request) {
                return util.format('Envelope from: %s to: %s', request.from, JSON.stringify(request.to));
            },
            formatRequest: combinators.identity,
            formatResponse: combinators.noop,
            respond: function (smtpRequest, originalRequest) { originalRequest.accept(); },
            metadata: combinators.constant({}),
            addStub: combinators.noop,
            stubs: []
        }),
        requestHandler = function (request) {
            result.emit('request', { remoteAddress: request.remoteAddress }, request);
        },
        server = smtp.createSimpleServer({ disableDNSValidation: true }, requestHandler);

    server.server.SMTPServer.on('connect', function (raiSocket) {
        result.emit('connection', raiSocket.socket);
    });

    result.close = function (callback) {
        server.server.end(combinators.noop);
        callback();
    };

    result.listen = function (port) {
        /* eslint-disable no-underscore-dangle */
        var deferred = Q.defer();
        server.listen(port, function () { deferred.resolve(server.server.SMTPServer._server.address().port); });
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
            Request: SmtpRequest
        },
        noOpValidator = {
            create: function () {
                return {
                    validate: function () {
                        return Q({
                            isValid: true,
                            errors: []
                        });
                    }
                };
            }
        };

    return {
        name: implementation.protocolName,
        create: AbstractServer.implement(implementation, recordRequests, debug, logger).create,
        Validator: noOpValidator
    };
}

module.exports = {
    initialize: initialize
};
