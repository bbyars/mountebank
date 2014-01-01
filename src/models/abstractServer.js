'use strict';

var Q = require('q'),
    util = require('util'),
    Domain = require('domain'),
    winston = require('winston'),
    ScopedLogger = require('../util/scopedLogger');

function socketName (socket) {
    return util.format('%s:%s', socket.remoteAddress, socket.remotePort);
}

function implement (implementation) {

    function create (port, options) {
        function createScopedLogger () {
            var scope = util.format('%s:%s', implementation.protocolName, port);
            if (options.name) {
                scope += ' ' + options.name;
            }
            return ScopedLogger.create(winston, scope);
        }

        var deferred = Q.defer(),
            logger = createScopedLogger(),
            requests = [],
            server = implementation.createServer(logger, options);

        server.on('connection', function (socket) {
            var name = socketName(socket);

            logger.debug('%s connected', name);

            socket.on('error', function (error) {
                logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
            });

            socket.on('end', function () { logger.debug('%s sent FIN packet', name); });
            socket.on('close', function () { logger.debug('%s fully closed', name); });
        });

        server.on('request', function (clientName, request) {
            var domain = Domain.create(),
                errorHandler = function (error) {
                    logger.error('%s X=> %s', clientName, JSON.stringify(error));
                    server.errorHandler(error, request);
                };

            logger.info('%s => %s', clientName, server.formatRequestShort(request));

            domain.on('error', errorHandler);
//            domain.run(function () {
                implementation.Request.createFrom(request).then(function (simpleRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(server.formatRequest(simpleRequest)));
                    requests.push(simpleRequest);
                    return server.respond(simpleRequest, request);
                }).done(function (response) {
                    logger.debug('%s <= %s', clientName, JSON.stringify(server.formatResponse(response)));
                }, errorHandler);
//            });
        });

        server.listen(port).done(function () {
            var metadata = server.metadata(options);
            if (options.name) {
                metadata.name = options.name;
            }

            logger.info('Open for business...');

            deferred.resolve({
                requests: requests,
                addStub: server.addStub,
                metadata: metadata,
                close: function () {
                    server.close(function () { logger.info ('Ciao for now'); });
                }
            });
        });

        return deferred.promise;
    }

    return {
        create: create
    };
}

module.exports = {
    implement: implement
};
