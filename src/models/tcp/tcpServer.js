'use strict';

var AbstractServer = require('../abstractServer'),
    net = require('net'),
    Q = require('q'),
    inherit = require('../../util/inherit'),
    combinators = require('../../util/combinators'),
    helpers = require('../../util/helpers'),
    Proxy = require('./tcpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    StubRepository = require('../stubRepository'),
    events = require('events'),
    TcpRequest = require('./tcpRequest'),
    exceptions = require('../../errors/errors');

function postProcess (stub) {
    return {
        data: stub.data || ''
    };
}

function createServer (logger, options) {
    var mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        ensureBuffer = function (data) {
            return Buffer.isBuffer(data) ? data : new Buffer(data, encoding);
        },
        proxy = Proxy.create(logger, encoding),
        stubs = StubRepository.create(proxy, postProcess),
        result = inherit.from(events.EventEmitter, {
            errorHandler: function (error, container) {
                container.socket.write(JSON.stringify({ errors: [error] }), 'utf8');
            },
            formatRequestShort: function (request) {
                if (request.data.length > 20) {
                    return request.data.toString(encoding, 0, 20) + '...';
                }
                else {
                    return request.data.toString(encoding);
                }
            },
            formatRequest: function (tcpRequest) {
                return tcpRequest.data.toString(encoding);
            },
            formatResponse: combinators.identity,
            respond: function (tcpRequest, originalRequest) {
                var clientName = helpers.socketName(originalRequest.socket),
                    scopedLogger = logger.withScope(clientName);

                return stubs.resolve(tcpRequest, scopedLogger).then(function (stubResponse) {
                    var buffer = ensureBuffer(stubResponse.data);

                    if (buffer.length > 0) {
                        originalRequest.socket.write(buffer);
                    }

                    return buffer.toString(encoding);
                });
            },
            metadata: function () { return { mode: mode }; },
            addStub: stubs.addStub
        }),
        server = net.createServer();

    server.on('connection', function (socket) {
        result.emit('connection', socket);

        socket.on('data', function (data) {
            var container = { socket: socket, data: data.toString(encoding) };
            result.emit('request', socket, container);
        });
    });

    result.close = function () { server.close(); };

    result.listen = function (port) {
        var deferred = Q.defer();
        server.listen(port, function () { deferred.resolve(); });
        return deferred.promise;
    };

    return result;
}

function initialize (allowInjection) {
    var implementation = {
        protocolName: 'tcp',
        createServer: createServer,
        Request: TcpRequest
    };

    function validateMode (request) {
        var errors = [];
        if (request.mode && ['text', 'binary'].indexOf(request.mode) < 0) {
            errors.push(exceptions.ValidationError("'mode' must be one of ['text', 'binary']"));
        }
        return errors;
    }

    return {
        name: implementation.protocolName,
        create: AbstractServer.implement(implementation).create,
        Validator: {
            create: function () {
                return DryRunValidator.create(StubRepository, TcpRequest.createTestRequest(), allowInjection, validateMode);
            }
        }
    };
}

module.exports = {
    initialize: initialize
};
