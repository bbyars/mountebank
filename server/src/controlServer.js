'use strict';

var express = require('express'),
    middleware = require('./middleware'),
    homeController = require('./controllers/homeController');

function create (port) {
    var app = express();
    app.use(middleware.createAbsoluteUrl(port));
    app.use(express.logger({format: '[ROOT]: :method :url'}));
    app.listen(port);
    console.log('Server running at http://127.0.0.1:' + port);

    app.get('/', homeController.get);

    return {
        close: function () {
            console.log('Goodbye...');
        }
    };
}

module.exports = {
    create: create
};
