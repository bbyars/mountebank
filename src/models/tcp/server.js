'use strict';

var net = require('net'),
    Q = require('q'),
    logger = require('winston'),
    Proxy = require('./proxy'),
    Domain = require('domain'),
    StubRepository = require('./stubRepository');

var create = function (port, options) {
    var logPrefix = '[tcp:' + port + '] ',
        deferred = Q.defer(),
        encoding = options.mode === 'binary' ? 'base64' : 'utf8',
        requests = [],
        stubs = StubRepository.create(Proxy.create()),
        server = net.createServer(function connectionListener (client) {
            var clientName = client.remoteAddress + ':' + client.remotePort,
                errorHandler = function (error) {
                    logger.error(logPrefix + clientName + ' => ' + JSON.stringify(error));
                    client.write(JSON.stringify(error), 'utf8');
                };

            logger.info(logPrefix + 'connection started from ' + clientName);

            client.on('error', errorHandler);
            client.on('data', function (data) {
                var request = { host: client.remoteAddress, port: client.remotePort, data: data },
                    domain = Domain.create();

                logger.info(logPrefix + clientName + ' => ' + data.toString(encoding));
                requests.push(request);

                domain.on('error', errorHandler);
                domain.run(function () {
                    stubs.resolve(request).done(function (stubResponse) {
                        logger.info(logPrefix + stubResponse.data.toString(encoding) + ' => ' + clientName);
                        client.write(stubResponse.data);
                    }, errorHandler);
                });
            });

            client.on('end', function () {
                //TODO: Allow stubResponse here?
                logger.info(logPrefix + 'connection ended from ' + clientName);
            });
        });

    server.on('close', function () {
        logger.info(logPrefix + 'Bye bye...');
    });

    server.listen(port, function () {
        logger.info(logPrefix + 'Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: stubs.addStub,
            close: function () {
                server.close();
            }
        });
    });

    return deferred.promise;
};

function initialize () {
    return {
        name: 'tcp',
        create: create
    };
}

module.exports = {
    initialize: initialize
};
