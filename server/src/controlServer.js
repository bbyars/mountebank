'use strict';

var express = require('express');

var create = function create (port) {

    var app = express();
    app.use(express.logger({format: '[ROOT]: :method :url'}));
    app.listen(port);
    console.log('Server running at http://127.0.0.1:' + port);

    app.get('/', function (request, response) {
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.end('Hello World\n');
    });

    return {
        close: function () {
            console.log('Goodbye...');
        }
    };
};

exports.create = create;
