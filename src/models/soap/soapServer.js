'use strict';

var http = require('http'),
    Q = require('q'),
    baseLogger = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    StubResolver = require('../stubResolver'),
    StubRepository = require('../stubRepository'),
    util = require('util'),
    helpers = require('../../util/helpers'),
    combinators = require('../../util/combinators'),
    HttpProxy = require('../http/httpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    Domain = require('domain'),
    url = require('url'),
    errors = require('../../util/errors');

function postProcess (stub) {
    var response = {
            statusCode: stub.statusCode || 200,
            headers: stub.headers || {},
            body: stub.body || ''
        };

    // We don't want to use keepalive connections, because a test case
    // may shutdown the stub, which prevents new connections for
    // the port, but that won't prevent the system under test
    // from reusing an existing TCP connection after the stub
    // has shutdown, causing difficult to track down bugs when
    // multiple tests are run.
    response.headers.connection = 'close';
    return response;
}

function scopeFor (port, name) {
    var scope = util.format('soap:%s', port);
    if (name) {
        scope += ' ' + name;
    }
    return scope;
}

function logConnection (logger, socket) {
    var name = helpers.socketName(socket);

    logger.debug('%s ESTABLISHED', name);

    socket.on('error', function (error) {
        logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
    });

    socket.on('end', function () { logger.debug('%s LAST-ACK', name); });
    socket.on('close', function () { logger.debug('%s CLOSED', name); });
}

function transform (request) {
    var parts = url.parse(request.url, true);
    return {
        requestFrom: helpers.socketName(request.socket),
        method: request.method,
        path: parts.pathname,
        query: parts.query,
        headers: request.headers,
        body: request.body
    };
}

function createSimplifiedRequestFrom (request) {
    var deferred = Q.defer();
    request.body = '';
    request.setEncoding('utf8');
    request.on('data', function (chunk) { request.body += chunk; });
    request.on('end', function () { deferred.resolve(transform(request)); });
    return deferred.promise;
}

/**
 * Spins up a server listening on a socket
 * @param options - the JSON request body for the imposter create request
 * @param recordRequests - the inverse of the --nomock command line parameter
 */
function createServer (options, recordRequests) {
    var deferred = Q.defer(),
        requests = [],
        logger = ScopedLogger.create(baseLogger, scopeFor(options.port)),
        proxy = HttpProxy.create(logger),
        resolver = StubResolver.create(proxy, postProcess),
        stubs = StubRepository.create(resolver, recordRequests, 'utf8'),
        server = http.createServer(),
        connectionLogger = combinators.curry(logConnection, logger);

    server.on('connection', connectionLogger);

    server.on('request', function (request, response) {
        var domain = Domain.create(),
            clientName = helpers.socketName(request.socket),
            errorHandler = function (error) {
                logger.error('%s X=> %s', clientName, JSON.stringify(errors.details(error)));
                server.errorHandler(errors.details(error), { request: request, response: response });
            };

        logger.info('%s => %s %s', clientName, request.method, request.url);

        domain.on('error', errorHandler);
        domain.run(function () {
            createSimplifiedRequestFrom(request).then(function (simpleRequest) {
                logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                if (recordRequests) {
                    requests.push(simpleRequest);
                }

                return stubs.resolve(simpleRequest, logger.withScope(helpers.socketName(request.socket)));
            }).then(function (stubResponse) {
                var body = '<?xml version="1.0"?>\n' +
                            '<soap-env:Envelope ' +
                            'xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" ' +
                            'soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/>\n' +
                            '   <soap-env:Body>\n' +
                            '       <m:GetLastTradePriceResponse xmlns:m="Some-URI">\n' +
                            '           <Price>34.5</Price>\n' +
                            '       </m:GetLastTradePriceResponse>\n' +
                            '   </soap-env:Body>\n' +
                            '</soap-env:Envelope>';
                response.writeHead(stubResponse.statusCode, stubResponse.headers);
                response.end(body, 'utf8');
                return stubResponse;
            }).done(function (response) {
                logger.debug('%s <= %s', clientName, JSON.stringify(response));
            }, errorHandler);
        });
    });

    server.listen(options.port || 0, function () {
        var actualPort = server.address().port,
            metadata = {};

        if (options.name) {
            metadata.name = options.name;
        }

        if (options.port !== actualPort) {
            logger.changeScope(scopeFor(actualPort));
        }

        logger.info('Open for business...');

        deferred.resolve({
            requests: requests,
            addStub: stubs.addStub,
            stubs: stubs.stubs,
            metadata: metadata,
            port: actualPort,
            close: function () {
                server.close();
                logger.info ('Ciao for now');
            }
        });
    });

    return deferred.promise;
}

function initialize (allowInjection, recordRequests) {
    return {
        name: 'soap',
        create: function (request) {
            return createServer(request, recordRequests);
        },
        Validator: {
            create: function () {
                return DryRunValidator.create({
                    StubRepository: StubRepository,
                    testRequest: {
                        requestFrom: '',
                        method: 'GET',
                        path: '/',
                        query: {},
                        headers: {},
                        body: ''
                    },
                    allowInjection: allowInjection
                });
            }
        }
    };
}

module.exports = {
    initialize: initialize
};
