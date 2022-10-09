'use strict';
const net = require('net'),
    helpers = require('../../util/helpers.js'),
    tcpRequest = require('./tcpRequest.js'),
    tcpProxy = require('./tcpProxy.js'),
    tcpValidator = require('./tcpValidator.js'),
    errors = require('../../util/errors.js');

/**
 * Represents a tcp imposter
 * @module
 */

function create (options, logger, responseFn) {
    const mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        server = net.createServer(),
        connections = {},
        defaultResponse = options.defaultResponse || { data: '' };

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

    // eslint-disable-next-line complexity
    async function respond (payload, request, clientName, socket) {
        let formattedRequestData = payload.toString(encoding);
        if (formattedRequestData.length > 20) {
            formattedRequestData = formattedRequestData.substring(0, 20) + '...';
        }
        logger.info('%s => %s', clientName, formattedRequestData);

        try {
            // Translate network request to JSON
            const jsonRequest = await tcpRequest.createFrom(request);
            logger.debug('%s => %s', clientName, JSON.stringify(jsonRequest.data.toString(encoding)));

            // call mountebank with JSON request
            const mbResponse = await responseFn(jsonRequest),
                processedResponse = mbResponse.data || defaultResponse.data,
                buffer = Buffer.isBuffer(processedResponse)
                    ? processedResponse
                    : Buffer.from(processedResponse, encoding);

            if (mbResponse.blocked) {
                socket.destroy();
                return;
            }

            if (helpers.simulateFault(socket, mbResponse.fault, logger)) {
                return;
            }

            if (buffer.length > 0) {
                socket.write(buffer);
                logger.debug('%s <= %s', clientName, JSON.stringify(buffer.toString(encoding)));
            }
        }
        catch (error) {
            logger.error('%s X=> %s', clientName, JSON.stringify(errors.details(error)));
            socket.write(JSON.stringify({ errors: [error] }), 'utf8');
        }
    }

    server.on('connection', socket => {
        let packets = [];
        const clientName = helpers.socketName(socket);

        logger.debug('%s ESTABLISHED', clientName);

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

        socket.on('data', async data => {
            packets.push(data);

            const payload = Buffer.concat(packets),
                request = { socket: socket, data: payload.toString(encoding) };

            if (isEndOfRequest(payload)) {
                packets = [];
                await respond(payload, request, clientName, socket);
            }
        });
    });

    return new Promise((resolve, reject) => {
        server.on('error', error => {
            if (error.errno === 'EADDRINUSE') {
                reject(errors.ResourceConflictError(`Port ${options.port} is already in use`));
            }
            else if (error.errno === 'EACCES') {
                reject(errors.InsufficientAccessError());
            }
            else {
                reject(error);
            }
        });

        // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
        server.listen(options.port || 0, options.host, () => {
            resolve({
                port: server.address().port,
                metadata: { mode },
                close: callback => {
                    server.close(() => { callback(); });
                    Object.keys(connections).forEach(socket => {
                        connections[socket].destroy();
                    });
                },
                proxy: tcpProxy.create(logger, encoding, isEndOfRequest),
                encoding: encoding,
                isEndOfRequest: isEndOfRequest
            });
        });
    });
}

module.exports = {
    testRequest: { data: 'test' },
    testProxyResponse: { data: '' },
    create: create,
    validate: tcpValidator.validate
};
