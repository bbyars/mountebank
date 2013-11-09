'use strict';

var connect = require('connect'),
    Q = require('q');

var create = function (port) {
    var logPrefix = '[http/' + port + '] ',
        server = connect(),
        deferred = Q.defer();

    server.use(connect.logger({format: logPrefix + ':method :url'}));
    server.use(function (request, response) {
        response.statusCode = 200;
        response.end();
    });

    server.on('close', function () {
        console.log(logPrefix + 'Ciao');
    });

    server.listen(port, function () {
        console.log(logPrefix + 'Open for business...');
        deferred.resolve();
    });
    return deferred.promise;
};

module.exports = {
    name: 'http',
    create: create
};
