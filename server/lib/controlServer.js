'use strict'

var http = require('http');

var create = function create (port) {
    http.createServer(function (request, response) {
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.end('Hello World\n');
    }).listen(port);

    console.log('Server running at http://127.0.0.1:' + port);

    return {
        close: function () {
            console.log('Goodbye...');
        }
    };
}

exports.create = create;