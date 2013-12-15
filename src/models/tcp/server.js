'use strict';

var net = require('net'),
    Q = require('q'),
    logger = require('winston');

var create = function (port) {
    var logPrefix = '[tcp:' + port + '] ',
        deferred = Q.defer(),
        requests = [];

    var server = net.createServer(function connectionListener (client) {
        client.name = client.remoteAddress + ':' + client.remotePort;
        logger.info(logPrefix + 'connection started from ' + client.name);

        var request = [];
        requests.push(request);

        client.on('data', function (chunk) {
            logger.info(logPrefix + client.name + ' => ' + chunk.toString('base64'));
            request.push(chunk);
        });

        client.on('error', function (error) {
            logger.error(logPrefix + client.name + ' => ' + JSON.stringify(error));
        });

        client.on('end', function () {
            logger.info(logPrefix + 'connection ended from ' + client.name);
            logger.info(logPrefix + 'full request => ' + Buffer.concat(request).toString('base64'));
        });
    });

    server.on('close', function () {
        logger.info(logPrefix + 'Bye bye...');
    });

    server.listen(port, function () {
        logger.info(logPrefix + 'Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: function () {},
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
