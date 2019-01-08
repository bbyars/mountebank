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
                    const buffer = Buffer.concat(packets),
                        body = buffer.toString('utf8');

                    if (mbResponse.statusCode !== 200) {
                        deferred.reject(require('../../util/errors').CommunicationError({
                            statusCode: mbResponse.statusCode,
                            body: body
                        }));
                    }
                    else {
                        responseDeferred.resolve(JSON.parse(body));
                    }
                });
            });

        mbRequest.on('error', responseDeferred.reject);
        mbRequest.write(JSON.stringify({ request }));
        mbRequest.end();
        return responseDeferred.promise;
    }

    function getModifiedProxyResponseFromMountebank (proxyResponse, proxyCallbackUrl) {
        const responseDeferred = Q.defer(),
            url = require('url'),
            parts = url.parse(proxyCallbackUrl),
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
                    const buffer = Buffer.concat(packets),
                        body = buffer.toString('utf8');

                    if (mbResponse.statusCode !== 200) {
                        deferred.reject(require('../../util/errors').CommunicationError({
                            statusCode: mbResponse.statusCode,
                            body: body
                        }));
                    }
                    else {
                        responseDeferred.resolve(JSON.parse(body));
                    }
                });
            });

        mbRequest.on('error', responseDeferred.reject);
        mbRequest.write(JSON.stringify({
            proxyResponse: { data: proxyResponse.data },
            _proxyResponseTime: proxyResponse._proxyResponseTime // eslint-disable-line no-underscore-dangle
        }));
        mbRequest.end();
        return responseDeferred.promise;
    }

    function getProxyResponse (proxyConfig, request, proxyCallbackUrl) {
        const proxy = require('../tcp/tcpProxy').create(logger, 'utf8');
        return proxy.to(proxyConfig.to, request, proxyConfig).then(response => {
            logger.warn('Got proxy response: ' + JSON.stringify(response));
            return getModifiedProxyResponseFromMountebank(response, proxyCallbackUrl);
        });
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
                    const buffer = Buffer.from(stubResponse.data, 'utf8');
                    socket.write(buffer);
                });
            }
            else {
                getResponseFromMountebank(request).then(mbResponse => {
                    if (mbResponse.proxy) {
                        return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackUrl);
                    }
                    else {
                        return Q(mbResponse.response);
                    }
                }).done(response => {
                    // translate response JSON to network request
                    socket.write(Buffer.from(response.data, 'utf8'), () => { socket.end(); });
                }, error => {
                    socket.write(require('../../util/errors').details(error), () => { socket.end(); });
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
