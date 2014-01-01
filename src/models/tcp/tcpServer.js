'use strict';

var AbstractServer = require('../abstractServer'),
    net = require('net'),
    Q = require('q'),
    inherit = require('../../util/inherit'),
    Proxy = require('./tcpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    StubRepository = require('../stubRepository'),
    util = require('util'),
    events = require('events'),
    TcpRequest = require('./tcpRequest'),
    exceptions = require('../../errors/errors');

function postProcess (stub) {
    return {
        data: stub.data || ''
    };
}

function socketName (socket) {
    return util.format('%s:%s', socket.remoteAddress, socket.remotePort);
}

function createServer (logger, options) {
    var mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        ensureBuffer = function (data) {
            return Buffer.isBuffer(data) ? data : new Buffer(data, encoding);
        },
        proxy = Proxy.create(logger, encoding),
        stubs = StubRepository.create(proxy, logger, postProcess),
        result = inherit.from(new events.EventEmitter(), {
            errorHandler: function (error, request) {
                request.socket.write(JSON.stringify({ errors: [error] }), 'utf8');
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
            formatResponse: function (stubResponse) {
                return ensureBuffer(stubResponse.data).toString(encoding);
            },
            respond: function (tcpRequest, originalRequest) {
                return stubs.resolve(tcpRequest).then(function (stubResponse) {
                    var buffer = ensureBuffer(stubResponse.data);

                    if (buffer.length > 0) {
                        originalRequest.socket.write(buffer);
                    }
                });
            },
            metadata: function () { return { mode: mode }; },
            addStub: stubs.addStub
        }),
        server = net.createServer();

    server.on('connection', function (socket) {
        result.emit('connection', socket);

        socket.on('data', function (data) {
            result.emit('request', socketName(socket), { socket: socket, data: data.toString(encoding) });
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

var implementation = {
    protocolName: 'tcp',
    createServer: createServer,
    Request: TcpRequest
};

function initialize (allowInjection) {
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
