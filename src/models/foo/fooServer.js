'use strict';

/**
 * A sample protocol implementation, used for demo purposes only
 * @module
 */

function postJSON (what, where) {
    const Q = require('q'),
        deferred = Q.defer(),
        url = require('url'),
        parts = url.parse(where),
        driver = require(parts.protocol.replace(':', '')),
        options = {
            hostname: parts.hostname,
            port: parts.port,
            path: parts.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        },
        request = driver.request(options, response => {
            const packets = [];

            response.on('data', chunk => packets.push(chunk));

            response.on('end', () => {
                const buffer = Buffer.concat(packets),
                    body = buffer.toString('utf8');

                if (response.statusCode !== 200) {
                    deferred.reject(require('../../util/errors').CommunicationError({
                        statusCode: response.statusCode,
                        body: body
                    }));
                }
                else {
                    deferred.resolve(JSON.parse(body));
                }
            });
        });

    request.on('error', deferred.reject);
    request.write(JSON.stringify(what));
    request.end();
    return deferred.promise;
}

function create (options, logger, responseFn) {
    const Q = require('q'),
        net = require('net'),
        deferred = Q.defer(),
        server = net.createServer();

    let callbackUrl;

    function getProxyResponse (proxyConfig, request, proxyCallbackUrl) {
        const proxy = require('../tcp/tcpProxy').create(logger, 'utf8');
        return proxy.to(proxyConfig.to, request, proxyConfig)
            .then(response => postJSON({ proxyResponse: response }, proxyCallbackUrl));
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
                    const buffer = Buffer.from(stubResponse.data, 'utf8');
                    socket.write(buffer);
                });
            }
            else {
                postJSON({ request }, callbackUrl).then(mbResponse => {
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
    testRequest: { data: '' },
    testProxyResponse: { data: '' },
    create: create,
    validate: undefined
};
