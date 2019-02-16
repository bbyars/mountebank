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

function create (port, callbackURLTemplate, defaultResponse) {
    const Q = require('q'),
        net = require('net'),
        deferred = Q.defer(),
        server = net.createServer(),
        logger = {};
    let callbackURL = callbackURLTemplate.replace(':port', port);

    defaultResponse = defaultResponse || { data: 'foo' };

    ['debug', 'info', 'warn', 'error'].forEach(level => {
        logger[level] = function () {
            const args = Array.prototype.slice.call(arguments),
                message = require('util').format.apply(this, args);

            console.log(`${level} ${message}`);
        };
    });

    function getProxyResponse (proxyConfig, request, proxyCallbackURL) {
        const proxy = require('../tcp/tcpProxy').create(logger, 'utf8');
        return proxy.to(proxyConfig.to, request, proxyConfig)
            .then(response => postJSON({ proxyResponse: response }, proxyCallbackURL));
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

            postJSON({ request }, callbackURL).then(mbResponse => {
                if (mbResponse.proxy) {
                    return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackURL);
                }
                else {
                    return Q(mbResponse.response);
                }
            }).done(response => {
                const processedResponse = response.data || defaultResponse.data || 'foo';

                // translate response JSON to network request
                socket.write(Buffer.from(processedResponse, 'utf8'), () => { socket.end(); });
            }, error => {
                socket.write(require('../../util/errors').details(error), () => { socket.end(); });
            });
        });
    });

    server.on('error', deferred.reject);

    // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
    server.listen(port || 0, () => {
        callbackURL = callbackURLTemplate.replace(':port', server.address().port);
        deferred.resolve({
            port: server.address().port,
            metadata: {},
            close: callback => {
                server.close();
                callback();
            },
            encoding: 'utf8'
        });
    });

    return deferred.promise;
}

const config = JSON.parse(process.argv[2]),
    port = config.port,
    callbackURLTemplate = config.callbackURLTemplate,
    defaultResponse = config.defaultResponse;

create(port, callbackURLTemplate, defaultResponse).done(server => {
    console.log(JSON.stringify({ port: server.port }));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
