'use strict';

/**
 * A sample protocol implementation, used for demo purposes only
 * @module
 */

function create (options, logger, responseFn) {
    const Q = require('q'),
        net = require('net'),
        deferred = Q.defer(),
        server = net.createServer();

    let callbackUrl;

    function getResponseFromMountebank (request) {
        const responseDeferred = Q.defer(),
            url = require('url'),
            parts = url.parse(callbackUrl),
            driver = require(parts.protocol.replace(':', '')),
            mbOptions = {
                hostname: parts.hostname,
                port: parts.port,
                path: parts.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            },
            mbRequest = driver.request(mbOptions, mbResponse => {
                const packets = [];

                mbResponse.on('data', chunk => packets.push(chunk));

                mbResponse.on('end', () => {
                    const buffer = Buffer.concat(packets);
                    mbResponse.body = JSON.parse(buffer.toString('utf8'));
                    responseDeferred.resolve(mbResponse);
                });
            });

        mbRequest.on('error', responseDeferred.reject);
        mbRequest.write(JSON.stringify({ request }));
        mbRequest.end();
        return responseDeferred.promise;
    }

    server.on('connection', socket => {
        socket.on('data', data => {
            // Translate network request to JSON
            const helpers = require('../../util/helpers'),
                request = {
                    requestFrom: helpers.socketName(socket),
                    data: data.toString('utf8')
                };

            logger.info(`${request.requestFrom} => ${request.data}`);

            // call mountebank with JSON request
            if (options.inProcessResolution) {
                responseFn(request).done(stubResponse => {
                    // translate response JSON to network request
                    const buffer = new Buffer(stubResponse.data, 'utf8');
                    socket.write(buffer);
                });
            }
            else {
                getResponseFromMountebank(request).done(mbResponse => {
                    if (mbResponse.statusCode === 200) {
                        // translate response JSON to network request
                        const stubResponse = mbResponse.body.response;
                        const buffer = new Buffer(stubResponse.data, 'utf8');
                        socket.write(buffer);
                    }
                    else {
                        const errors = require('../../util/errors'),
                            error = errors.CommunicationError({
                                statusCode: mbResponse.statusCode,
                                body: mbResponse.body
                            });
                        logger.error(`Error calling mountebank: ${errors.details(error)}`);
                        socket.write(JSON.stringify(error));
                    }
                });
            }
        });
    });

    // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
    server.listen(options.port || 0, () => {
        deferred.resolve({
            port: server.address().port,
            metadata: {},
            close: callback => {
                server.close();
                callback();
            },
            postProcess: function (response, request, defaultResponse) {
                return { data: response.data || defaultResponse.data || 'foo' };
            },
            proxy: require('../tcp/tcpProxy').create(logger, 'utf8'),
            encoding: 'utf8',
            setCallbackUrl: url => { callbackUrl = url; }
        });
    });

    return deferred.promise;
}

module.exports = {
    name: 'foo',
    testRequest: { data: '' },
    testProxyResponse: { data: '' },
    create: create,
    validate: undefined
};
