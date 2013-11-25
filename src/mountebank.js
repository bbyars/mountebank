'use strict';

var express = require('express'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    RequestsController = require('./controllers/requestsController'),
    StubsController = require('./controllers/stubsController'),
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
        requestsController = RequestsController.create(imposters),
        stubsController = StubsController.create(imposters),
        validateImposterExists = middleware.createImposterValidator(imposters);

    app.use(middleware.createAbsoluteUrl(port));
    app.use(express.logger({immediate: true, format: '[mb  /' + port + '] :method :url'}));
    app.use(express.json());
    app.listen(port);
    console.log('mountebank accepting orders at http://localhost:' + port);

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);
    app.get('/imposters/:id/requests', validateImposterExists, requestsController.get);
    app.get('/imposters/:id/stubs', validateImposterExists, stubsController.get);
    app.post('/imposters/:id/stubs', validateImposterExists, stubsController.post);

    return {
        close: function () {
            console.log('Adios - see you soon?');
        }
    };
}

module.exports = {
    create: create
};
