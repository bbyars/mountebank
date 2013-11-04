'use strict';

var express = require('express'),
    middleware = require('./middleware'),
    homeController = require('./controllers/homeController'),
    impostersController = require('./controllers/impostersController');

function create (port) {
    var app = express(),
        imposters = [];
    app.use(middleware.createAbsoluteUrl(port));
    app.use(express.logger({format: '[ROOT]: :method :url'}))
    app.use(express.json());
    app.listen(port);
    console.log('Server running at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/servers', impostersController.get(imposters));
    app.post('/servers', impostersController.post(imposters));

    return {
        close: function () {
            console.log('Goodbye...');
        }
    };
}

module.exports = {
    create: create
};
