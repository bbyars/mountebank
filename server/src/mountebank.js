'use strict';

var express = require('express'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    protocols = [
        require('./models/http/server')
    ];

function create (port) {
    var app = express(),
        imposters = {},
        impostersController = ImpostersController.create(protocols, imposters),
        imposterController = ImposterController.create(imposters);

    app.use(middleware.createAbsoluteUrl(port));
    app.use(express.logger({immediate: true, format: '[mb  /' + port + '] :method :url'}));
    app.use(express.json());
    app.listen(port);
    console.log('mountebank accepting orders at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', imposterController.get);
    app.del('/imposters/:id', imposterController.del);

    return {
        close: function () {
            console.log('Ciao - see you soon?');
        }
    };
}

module.exports = {
    create: create
};
