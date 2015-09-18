'use strict';

var express = require('express'),
    cors = require('cors'),
    errorHandler = require('errorhandler'),
    path = require('path'),
    middleware = require('./util/middleware'),
    HomeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    LogsController = require('./controllers/logsController'),
    ConfigController = require('./controllers/configController'),
    FeedController = require('./controllers/feedController'),
    Imposter = require('./models/imposter'),
    winston = require('winston'),
    thisPackage = require('../package.json'),
    releases = require('../releases.json'),
    ScopedLogger = require('./util/scopedLogger'),
    util = require('util');

function create (options) {
    var app = express(),
        imposters = {},
        protocols = {
            tcp: require('./models/tcp/tcpServer').initialize(options.allowInjection, options.mock, options.debug),
            http: require('./models/http/httpServer').initialize(options.allowInjection, options.mock, options.debug),
            https: require('./models/https/httpsServer').initialize(options.allowInjection, options.mock, options.debug),
            soap: require('./models/soap/soapServer').initialize(options.allowInjection, options.mock, options.debug),
            smtp: require('./models/smtp/smtpServer').initialize(options.mock, options.debug),
            foo: require('./models/foo/fooServer').initialize(options.allowInjection, options.mock, options.debug)
        },
        logger = ScopedLogger.create(winston, util.format('[mb:%s] ', options.port)),
        homeController = HomeController.create(releases),
        impostersController = ImpostersController.create(protocols, imposters, Imposter, logger),
        imposterController = ImposterController.create(imposters),
        logsController = LogsController.create(options.logfile),
        configController = ConfigController.create(thisPackage.version, options),
        feedController = FeedController.create(releases, options),
        validateImposterExists = middleware.createImposterValidator(imposters),
        welcome = util.format('mountebank v%s (node %s) now taking orders - point your browser to http://localhost:%s for help',
            thisPackage.version, process.version, options.port);

    logger.remove(logger.transports.Console);
    if (process.stdout.isTTY) {
        logger.add(logger.transports.Console, { colorize: true, level: options.loglevel });
    }
    logger.add(logger.transports.File, {
        filename: options.logfile,
        timestamp: true,
        level: options.loglevel,
        maxsize: 10000000,
        maxFiles: 1
    });

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger(logger, ':method :url'));
    app.use(middleware.globals({ heroku: options.heroku, port: options.port, version: thisPackage.version }));
    app.use(middleware.defaultIEtoHTML);
    app.use(middleware.json(logger));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, '../node_modules')));
    app.use(errorHandler());
    if(options.allowCORS) {
        app.use(cors());
    }

    app.disable('etag');
    app.disable('x-powered-by');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');
    app.set('json spaces', 2);

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.delete('/imposters', impostersController.del);
    app.put('/imposters', impostersController.put);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.delete('/imposters/:id', imposterController.del);
    app.get('/logs', logsController.get);
    app.get('/config', configController.get);
    app.get('/feed', feedController.getFeed);
    app.get('/releases', feedController.getReleases);
    app.get('/releases/:version', feedController.getRelease);

    app.get('/sitemap', function (request, response) {
        response.type('text/plain');
        response.render('sitemap', { releases: releases });
    });

    [
        '/support',
        '/contributing',
        '/license',
        '/faqs',
        '/thoughtworks',
        '/docs/examples',
        '/docs/gettingStarted',
        '/docs/install',
        '/docs/glossary',
        '/docs/commandLine',
        '/docs/clientLibraries',
        '/docs/api/overview',
        '/docs/api/mocks',
        '/docs/api/stubs',
        '/docs/api/predicates',
        '/docs/api/proxies',
        '/docs/api/injection',
        '/docs/api/behaviors',
        '/docs/api/errors',
        '/docs/protocols/http',
        '/docs/protocols/https',
        '/docs/protocols/tcp',
        '/docs/protocols/smtp'
    ].forEach(function (endpoint) {
        app.get(endpoint, function (request, response) {
            response.render(endpoint.substring(1));
        });
    });

    app.listen(options.port);

    logger.info(welcome);
    if (!process.stdout.isTTY) {
        // needed for a number of functional tests (e.g. httpInjectionTest.js)
        // that need to wait for a new mb process to start without a TTY
        console.log(welcome);
    }

    return {
        close: function () { logger.info('Adios - see you soon?'); }
    };
}

module.exports = {
    create: create
};
