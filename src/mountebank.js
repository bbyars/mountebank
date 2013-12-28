'use strict';

var express = require('express'),
    path = require('path'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    Imposter = require('./models/imposter'),
    logger = require('winston'),
    fs = require('fs'),
    thisPackage = require('../package.json');

function create (options) {
    var app = express(),
        imposters = {},
        protocols = {
            'tcp': require('./models/tcp/server').initialize(options.allowInjection),
            'http': require('./models/http/server').initialize(options.allowInjection)
        },
        impostersController = ImpostersController.create(protocols, imposters, Imposter),
        imposterController = ImposterController.create(imposters),
        validateImposterExists = middleware.createImposterValidator(imposters);

    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, { colorize: true, level: options.loglevel });
    logger.add(logger.transports.File, { filename: options.logfile, timestamp: true, level: options.loglevel });

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger(logger, '[mb:' + options.port + '] :method :url'));
    app.use(middleware.globals({ heroku: options.heroku }));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.errorHandler());

    app.disable('x-powered-by');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.listen(options.port);
    logger.info('mountebank now taking orders - point your browser to http://localhost:' + options.port + ' for help');

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);

    app.get('/logs', function (request, response) {
        response.render('logs', { content: fs.readFileSync(options.logfile) });
    });

    app.get('/config', function (request, response) {
        response.render('config', {
            version: thisPackage.version,
            logfile: options.logfile,
            allowInjection: options.allowInjection,
            process: process
        });
    });

    // Brochure-ware sections
    ['faqs', 'docs', 'license', 'contributing', 'support', 'docs/protocols/http'].forEach(function (endpoint) {
        app.get('/' + endpoint, function (request, response) { response.render(endpoint); });
    });

    return {
        close: function () {
            logger.info('Adios - see you soon?');
        }
    };
}

module.exports = {
    create: create
};
