'use strict';

var express = require('express'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    Imposter = require('./models/imposter'),
    protocols = [
        require('./models/http/server')
    ];

function create (port, allowInjection) {
    var app = express(),
        imposters = {},
        impostersController = ImpostersController.create({
            protocols: protocols,
            imposters: imposters,
            Imposter: Imposter,
            allowInjection: allowInjection
        }),
        imposterController = ImposterController.create(imposters),
        validateImposterExists = middleware.createImposterValidator(imposters);

    app.use(middleware.useAbsoluteUrls(port));
    app.use(express.logger({immediate: true, format: '[mb  /' + port + '] :method :url'}));
    app.use(express.json());
    app.listen(port);
    console.log('mountebank accepting orders at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);

    return {
        close: function () {
            console.log('Adios - see you soon?');
        }
    };
}

module.exports = {
    create: create
};
