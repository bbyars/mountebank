'use strict';

var http = require('http'),
    Q = require('q');

var create = function (port) {
    var logPrefix = '[http/' + port + '] ',
        deferred = Q.defer();

    var server = http.createServer(function (request, response) {
        console.log(logPrefix + request.method + ' ' + request.url);
        response.writeHead(200);
        response.end();
    });

    server.on('close', function () {
        console.log(logPrefix + 'Ciao');
    });

    server.listen(port, function () {
        console.log(logPrefix + 'Open for business...');
        deferred.resolve({
            close: function () {
                server.close();
            }
        });
    });

    return deferred.promise;
};

module.exports = {
    name: 'http',
    create: create
};
