'use strict';

var express = require('express'),
    middleware = require('./middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    protocols = {
        'http': require('./models/http/server')
    };

function create (port) {
    var app = express(),
        imposters = [],
        impostersController = ImpostersController.create(protocols, imposters);

    app.use(middleware.createAbsoluteUrl(port));
    app.use(express.logger({format: '[ROOT]: :method :url'}))
    app.use(express.json());
    app.listen(port);
    console.log('Server running at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/servers', impostersController.get);
    app.post('/servers', impostersController.post);

    return {
        close: function () {
            console.log('Goodbye...');
        }
    };
}

module.exports = {
    create: create
};
