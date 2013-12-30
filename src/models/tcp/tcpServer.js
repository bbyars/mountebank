'use strict';

var net = require('net'),
    Q = require('q'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    Proxy = require('./tcpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    Domain = require('domain'),
    StubRepository = require('../stubRepository'),
    util = require('util'),
    exceptions = require('../../errors/errors'),
    TcpRequest = require('./tcpRequest');

function postProcess (stub) {
    return {
        data: stub.data || ''
    };
}

var create = function (port, options) {
    var name = options.name ? util.format('tcp:%s %s', port, options.name) : 'tcp:' + port,
        logger = ScopedLogger.create(winston, name),
        deferred = Q.defer(),
        mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        requests = [],
        proxy = Proxy.create(logger, encoding),
        stubs = StubRepository.create(proxy, logger, postProcess),
        server = net.createServer(function connectionListener (client) {
            var clientName = client.remoteAddress + ':' + client.remotePort,
                errorHandler = function (error) {
                    logger.error(clientName + ' => ' + JSON.stringify(error));
                    client.write(JSON.stringify({ errors: [error] }), 'utf8');
                };

            logger.debug('connection started from ' + clientName);

            client.on('error', errorHandler);
            client.on('data', function (data) {
                var request = TcpRequest.createFrom(clientName, data.toString(encoding)),
                    domain = Domain.create();

                logger.debug('%s => <<%s>>', clientName, data.toString(encoding));
                requests.push(request);

                domain.on('error', errorHandler);
                domain.run(function () {
                    stubs.resolve(request).done(function (stubResponse) {
                        var buffer = Buffer.isBuffer(stubResponse.data) ?
                                stubResponse.data :
                                new Buffer(stubResponse.data, encoding);

                        if (buffer.length > 0) {
                            logger.debug('<<%s>> => %s', buffer.toString(encoding), clientName);
                            client.write(buffer);
                        }
                    }, errorHandler);
                });
            });

            client.on('end', function () {
                //TODO: Allow stubResponse here?
                logger.debug('connection ended from ' + clientName);
            });
        });

    server.listen(port, function () {
        logger.info('Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: stubs.addStub,
            metadata: { mode: mode },
            close: function () { server.close(function () { logger.info('Bye bye...'); }); }
        });
    });

    return deferred.promise;
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
        name: 'tcp',
        create: create,
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
