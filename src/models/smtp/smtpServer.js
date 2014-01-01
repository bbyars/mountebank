'use strict';

var AbstractServer = require('../abstractServer'),
    smtp = require('simplesmtp'),
    Q = require('q'),
    inherit = require('../../util/inherit'),
    combinators = require('../../util/combinators'),
    util = require('util'),
    events = require('events'),
    SmtpRequest = require('./smtpRequest');

function createServer () {
    var result = inherit.from(new events.EventEmitter(), {
            errorHandler: combinators.noop,
            formatRequestShort: function (request) {
                return util.format('Envelope from: %s to: %s', request.from, JSON.stringify(request.to));
            },
            formatRequest: combinators.identity,
            formatResponse: combinators.noop,
            respond: function (smtpRequest, originalRequest) { originalRequest.accept(); },
            metadata: combinators.constant({}),
            addStub: combinators.noop
        }),
        requestHandler = function (request) {
            result.emit('request', request.remoteAddress, request);
        },
        server = smtp.createSimpleServer({ disableDNSValidation: true }, requestHandler);

    server.server.SMTPServer.on('connect', function (raiSocket) {
        result.emit('connection', raiSocket.socket);
    });

    result.close = function () { server.server.end(combinators.noop); };

    result.listen = function (port) {
        var deferred = Q.defer();
        server.listen(port, function () {
            deferred.resolve();
        });
        return deferred.promise;
    };

    return result;
}

function initialize () {
    var implementation = {
        protocolName: 'smtp',
        createServer: createServer,
        Request: SmtpRequest
    };

    return {
        name: implementation.protocolName,
        create: AbstractServer.implement(implementation).create
    };
}

module.exports = {
    initialize: initialize
};
