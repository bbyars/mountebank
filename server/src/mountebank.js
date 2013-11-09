'use strict';

var express = require('express'),
    middleware = require('./util/middleware'),
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
    app.use(express.logger({immediate: true, format: '[mb/' + port + '] :method :url'}));
    app.use(express.json());
    app.listen(port);
    console.log('mountebank accepting orders at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);

    return {
        close: function () {
            console.log('Ciao - see you soon?');
        }
    };
}

module.exports = {
    create: create
};
