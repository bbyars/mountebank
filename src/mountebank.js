'use strict';

var express = require('express'),
    errorHandler = require('errorhandler'),
    bodyParser = require('body-parser'),
    path = require('path'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    Imposter = require('./models/imposter'),
    winston = require('winston'),
    fs = require('fs'),
    thisPackage = require('../package.json'),
    ScopedLogger = require('./util/scopedLogger'),
    util = require('util');

function create (options) {
    var app = express(),
        imposters = {},
        protocols = {
            'tcp': require('./models/tcp/tcpServer').initialize(options.allowInjection, options.mock),
            'http': require('./models/http/httpServer').initialize(options.allowInjection, options.mock),
            'https': require('./models/https/httpsServer').initialize(options.allowInjection, options.mock),
            'smtp': require('./models/smtp/smtpServer').initialize(options.mock)
        },
        logger = ScopedLogger.create(winston, util.format('[mb:%s] ', options.port)),
        impostersController = ImpostersController.create(protocols, imposters, Imposter, logger),
        imposterController = ImposterController.create(imposters),
        validateImposterExists = middleware.createImposterValidator(imposters);

    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, { colorize: true, level: options.loglevel });
    logger.add(logger.transports.File, { filename: options.logfile, timestamp: true, level: 'debug' });

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger(logger, ':method :url'));
    app.use(middleware.globals({ heroku: options.heroku, port: options.port, version: thisPackage.version }));
    app.use(bodyParser());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(errorHandler());

    app.disable('etag');
    app.disable('x-powered-by');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.listen(options.port);
    logger.info(util.format('mountebank v%s now taking orders - point your browser to http://localhost:%s for help',
        thisPackage.version, options.port));

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);

    app.get('/logs', function (request, response) {
        var json = ('[' + fs.readFileSync(options.logfile).toString().split('\n').join(',').replace(/,$/, '') + ']'),
            logs = JSON.parse(json);
        response.render('logs', { logs: logs });
    });

    app.get('/config', function (request, response) {
        response.render('config', {
            logfile: options.logfile,
            loglevel: options.loglevel,
            pidfile: options.pidfile,
            allowInjection: options.allowInjection,
            process: process
        });
    });

    [
        '/about',
        '/support',
        '/contributing',
        '/license',
        '/faqs',
        '/thoughtworks',
        '/docs/gettingStarted',
        '/docs/install',
        '/docs/glossary',
        '/docs/commandLine',
        '/docs/api/overview',
        '/docs/api/mocks',
        '/docs/api/stubs',
        '/docs/api/predicates',
        '/docs/api/proxies',
        '/docs/api/injection',
        '/docs/api/errors',
        '/docs/protocols/http',
        '/docs/protocols/https',
        '/docs/protocols/tcp',
        '/docs/protocols/smtp'
    ].forEach(function (endpoint) {
        app.get(endpoint, function (request, response) { response.render(endpoint.substring(1)); });
    });

    return {
        close: function () { logger.info('Adios - see you soon?'); }
    };
}

module.exports = {
    create: create
};
