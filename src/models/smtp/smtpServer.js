'use strict';

var AbstractServer = require('../abstractServer'),
    smtp = require('simplesmtp'),
    Q = require('q'),
    inherit = require('../../util/inherit'),
    util = require('util'),
    events = require('events'),
    SmtpRequest = require('./smtpRequest');

function noOp () {}

function createServer () {
    var result = inherit.from(new events.EventEmitter()),
        requestHandler = function (request) {
            result.emit('request', request.remoteAddress, request);
        },
        server = smtp.createSimpleServer({ disableDNSValidation: true }, requestHandler);

    server.server.SMTPServer.on('connect', function (raiSocket) {
        result.emit('connect', raiSocket.socket);
    });

    result.close = function () { server.server.end(noOp); };

    result.listen = function (port) {
        var deferred = Q.defer();
        server.listen(port, function () {
            deferred.resolve();
        });
        return deferred.promise;
    };

    return result;
}

var implementation = {
    protocolName: 'smtp',
    createServer: createServer,
    errorHandler: noOp,
    formatRequestShort: function (request) {
        return util.format('Envelope from: %s to: %s', request.from, JSON.stringify(request.to));
    },
    formatRequest: function (request) { return request; },
    respond: function (simpleRequest, originalRequest) {
        originalRequest.accept();
    },
    metadata: function () { return {} },
    addStub: noOp,
    Request: SmtpRequest
};

function initialize () {
    return {
        name: 'smtp',
        create: AbstractServer.implement(implementation).create
    };
}

module.exports = {
    initialize: initialize
};
