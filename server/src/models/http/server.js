'use strict';

var connect = require('connect'),
    Q = require('q');

var create = function (port) {
    var logPrefix = '[http:' + port + ']: ',
        server = connect.createServer(connect.logger({format: logPrefix + ':method :url'})),
        deferred = Q.defer();

    server.on('close', function () {
        console.log(logPrefix + 'Ciao');
    });

    server.listen(port, function () {
        console.log(logPrefix + 'Open for business...');
        deferred.resolve();
    });
    return deferred.promise;
};

exports.create = create;
