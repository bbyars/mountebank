'use strict';

var http = require('http'),
    Q = require('q'),
    Domain = require('domain'),
    StubRepository = require('./stubRepository'),
    Proxy = require('./proxy'),
    DryRunValidator = require('../dryRunValidator'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    url = require('url'),
    util = require('util');

function simplify (request) {
    var deferred = Q.defer();
    request.body = '';
    request.setEncoding('utf8');
    request.on('data', function (chunk) { request.body += chunk; });

    request.on('end', function () {
        var parts = url.parse(request.url, true);
        deferred.resolve({
            requestFrom: request.socket.remoteAddress + ':' + request.socket.remotePort,
            method: request.method,
            path: parts.pathname,
            query: parts.query,
            headers: request.headers,
            body: request.body
        });
    });
    return deferred.promise;
}

var create = function (port, options) {
    var name = options.name ? util.format('http:%s %s', port, options.name) : 'http:' + port,
        logger = ScopedLogger.create(winston, name),
        deferred = Q.defer(),
        requests = [],
        proxy = Proxy.create(logger),
        stubs = StubRepository.create(proxy, logger),
        server = http.createServer(function (request, response) {
            var clientName = request.socket.remoteAddress + ':' + request.socket.remotePort,
                domain = Domain.create(),
                errorHandler = function (error) {
                    logger.error(JSON.stringify(error));
                    response.writeHead(500, { 'content-type': 'application/json' });
                    response.end(JSON.stringify({ errors: [error] }), 'utf8');
                };

            logger.info('%s => %s %s', clientName, request.method, request.url);

            domain.on('error', errorHandler);

            domain.run(function () {
                simplify(request).then(function (simpleRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                    requests.push(simpleRequest);
                    return stubs.resolve(simpleRequest);
                }).done(function (stubResponse) {
                    logger.debug('%s => %s', JSON.stringify(stubResponse), clientName);
                    response.writeHead(stubResponse.statusCode, stubResponse.headers);
                    response.end(stubResponse.body.toString(), 'utf8');
                }, errorHandler);
            });
        });

    server.listen(port, function () {
        logger.info('Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: stubs.addStub,
            metadata: {},
            close: function () { server.close(function () { logger.info('Ciao for now'); }); }
        });
    });

    return deferred.promise;
};

function initialize (allowInjection) {
    return {
        name: 'http',
        create: create,
        Validator: {
            create: function () {
                var testRequest = { requestFrom: '', path: '/', query: {}, method: 'GET', headers: {}, body: '' };
                return DryRunValidator.create(StubRepository, testRequest, allowInjection);
            }
        }
    };
}

module.exports = {
    initialize: initialize
};
