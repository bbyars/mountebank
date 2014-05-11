'use strict';

var express = require('express'),
    errorHandler = require('errorhandler'),
    path = require('path'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    LogsController = require('./controllers/logsController'),
    ConfigController = require('./controllers/configController'),
    FeedController = require('./controllers/feedController'),
    Imposter = require('./models/imposter'),
    winston = require('winston'),
    thisPackage = require('../package.json'),
    ScopedLogger = require('./util/scopedLogger'),
    util = require('util');

function create (options) {
    var app = express(),
        imposters = {},
        protocols = {
            'tcp': require('./models/tcp/tcpServer').initialize(options.allowInjection, !options.nomock),
            'http': require('./models/http/httpServer').initialize(options.allowInjection, !options.nomock),
            'https': require('./models/https/httpsServer').initialize(options.allowInjection, !options.nomock),
            'smtp': require('./models/smtp/smtpServer').initialize(!options.nomock)
        },
        logger = ScopedLogger.create(winston, util.format('[mb:%s] ', options.port)),
        impostersController = ImpostersController.create(protocols, imposters, Imposter, logger),
        imposterController = ImposterController.create(imposters),
        logsController = LogsController.create(options.logfile),
        configController = ConfigController.create(thisPackage.version, options),
        feedController = FeedController.create(thisPackage.version, options),
        validateImposterExists = middleware.createImposterValidator(imposters);

    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, { colorize: true, level: options.loglevel });
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
    app.use(errorHandler());

    app.disable('etag');
    app.disable('x-powered-by');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');
    app.set('json spaces', 2);

    app.listen(options.port);
    logger.info(util.format('mountebank v%s now taking orders - point your browser to http://localhost:%s for help',
        thisPackage.version, options.port));

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.del('/imposters', impostersController.del);
    app.put('/imposters', impostersController.put);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);
    app.get('/logs', logsController.get);
    app.get('/config', configController.get);
    app.get('/feed', feedController.getFeed);
    app.get('/releases/:version', feedController.getRelease);

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
