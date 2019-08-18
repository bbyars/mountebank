'use strict';

/**
 * Represents an smtp imposter
 * @module
 */

function create (options, logger, responseFn) {
    const Q = require('q'),
        deferred = Q.defer(),
        connections = {},
        SMTPServer = require('smtp-server').SMTPServer,
        server = new SMTPServer({
            maxAllowedUnauthenticatedCommands: 1000,
            disableReverseLookup: true,
            authOptional: true,
            onConnect (socket, callback) {
                const helpers = require('../../util/helpers'),
                    name = helpers.socketName(socket);

                logger.debug('%s ESTABLISHED', name);

                if (socket.on) {
                    connections[name] = socket;

                    socket.on('error', error => {
                        logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
                    });

                    socket.on('end', () => {
                        logger.debug('%s LAST-ACK', name);
                    });

                    socket.on('close', () => {
                        logger.debug('%s CLOSED', name);
                        delete connections[name];
                    });
                }
                return callback();
            },
            onData (stream, socket, callback) {
                const request = { session: socket, source: stream, callback: callback };
                const domain = require('domain').create(),
                    helpers = require('../../util/helpers'),
                    clientName = helpers.socketName(socket),
                    errorHandler = error => {
                        const exceptions = require('../../util/errors');
                        logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                    };

                domain.on('error', errorHandler);
                domain.run(() => {
                    require('./smtpRequest').createFrom(request).then(simpleRequest => {
                        logger.info(`${clientName} => Envelope from: ${JSON.stringify(simpleRequest.from)} to: ${JSON.stringify(simpleRequest.to)}`);
                        logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                        return responseFn(simpleRequest);
                    }).then(response => {
                        if (response) {
                            logger.debug('%s <= %s', clientName, JSON.stringify(response));
                        }
                        return Q(true);
                    }).done(() => Q(request.callback()), errorHandler);
                });
            }
        });

    server.listen(options.port || 0, options.host, () => {
        deferred.resolve({
            port: server.server.address().port,
            metadata: {},
            close: callback => {
                server.close(callback);
                Object.keys(connections).forEach(socket => {
                    connections[socket].destroy();
                });
            },
            proxy: {},
            encoding: 'utf8'
        });
    });

    return deferred.promise;
}

module.exports = {
    testRequest: {
        from: 'test@test.com',
        to: ['test@test.com'],
        subject: 'Test',
        text: 'Test'
    },
    testProxyResponse: {},
    create: create,
    validate: undefined
};

