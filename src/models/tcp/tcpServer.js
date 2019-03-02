'use strict';

/**
 * Represents a tcp imposter
 * @module
 */

function create (options, logger, responseFn) {

    // Used to determine logical end of request; defaults to one packet but
    // changeable through injection
    function isEndOfRequest (requestData) {
        if (!options.endOfRequestResolver || !options.endOfRequestResolver.inject) {
            return true;
        }

        const injected = `(${options.endOfRequestResolver.inject})(requestData, logger)`;

        if (mode === 'text') {
            requestData = requestData.toString('utf8');
        }

        try {
            return eval(injected);
        }
        catch (error) {
            logger.error(`injection X=> ${error}`);
            logger.error(`    full source: ${JSON.stringify(injected)}`);
            logger.error(`    requestData: ${JSON.stringify(requestData)}`);
            return false;
        }
    }

    const mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        Q = require('q'),
        net = require('net'),
        deferred = Q.defer(),
        server = net.createServer(),
        helpers = require('../../util/helpers'),
        connections = {},
        defaultResponse = options.defaultResponse || { data: '' };

    server.on('connection', socket => {
        let packets = [];
        const clientName = helpers.socketName(socket);

        logger.debug('%s ESTABLISHED', clientName);

        if (socket.on) {
            connections[clientName] = socket;

            socket.on('error', error => {
                logger.error('%s transmission error X=> %s', clientName, JSON.stringify(error));
            });

            socket.on('end', () => {
                logger.debug('%s LAST-ACK', clientName);
            });

            socket.on('close', () => {
                logger.debug('%s CLOSED', clientName);
                delete connections[clientName];
            });
        }

        socket.on('data', data => {
            packets.push(data);

            const requestData = Buffer.concat(packets),
                request = { socket: socket, data: requestData.toString(encoding) };

            if (isEndOfRequest(requestData)) {
                packets = [];

                const domain = require('domain').create(),
                    errorHandler = error => {
                        const exceptions = require('../../util/errors');
                        logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                        socket.write(JSON.stringify({ errors: [error] }), 'utf8');
                    };

                let formattedRequestData = requestData.toString(encoding);
                if (formattedRequestData.length > 20) {
                    formattedRequestData = formattedRequestData.substring(0, 20) + '...';
                }
                logger.info('%s => %s', clientName, formattedRequestData);

                domain.on('error', errorHandler);
                domain.run(() => {
                    // Translate network request to JSON
                    require('./tcpRequest').createFrom(request).then(jsonRequest => {
                        logger.debug('%s => %s', clientName, JSON.stringify(jsonRequest.data.toString(encoding)));

                        // call mountebank with JSON request
                        return responseFn(jsonRequest);
                    }).done(mbResponse => {
                        if (mbResponse.blocked) {
                            socket.end();
                            return;
                        }
                        const processedResponse = mbResponse.data || defaultResponse.data,
                            buffer = Buffer.isBuffer(processedResponse)
                                ? processedResponse
                                : Buffer.from(processedResponse, encoding);

                        if (buffer.length > 0) {
                            socket.write(buffer);
                            logger.debug('%s <= %s', clientName, JSON.stringify(buffer.toString(encoding)));
                        }
                    }, errorHandler);
                });
            }
        });
    });

    // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
    server.listen(options.port || 0, options.host, () => {
        deferred.resolve({
            port: server.address().port,
            metadata: { mode },
            close: callback => {
                server.close(() => { callback(); });
                Object.keys(connections).forEach(socket => {
                    connections[socket].destroy();
                });
            },
            proxy: require('./tcpProxy').create(logger, encoding, isEndOfRequest),
            encoding: encoding
        });
    });

    return deferred.promise;
}

module.exports = {
    testRequest: { data: 'test' },
    testProxyResponse: { data: '' },
    create: create,
    validate: require('./tcpValidator').validate
};
