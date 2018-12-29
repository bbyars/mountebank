'use strict';

/**
 * The entry point for mountebank.  This module creates the mountebank server,
 * configures all middleware, starts the logger, and manages all routing
 * @module
 */

function initializeLogfile (filename) {
    // Ensure new logfile on startup so the /logs only shows for this process
    const path = require('path'),
        fs = require('fs'),
        extension = path.extname(filename),
        pattern = new RegExp(`${extension}$`),
        newFilename = filename.replace(pattern, `1${extension}`);

    if (fs.existsSync(filename)) {
        fs.renameSync(filename, newFilename);
    }
}

/**
 * Creates the mountebank server
 * @param {object} options - The command line options
 * @returns {Object} An object with a close method to stop the server
 */
function create (options) {
    const Q = require('q'),
        express = require('express'),
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
        format = winston.format,
        consoleFormat = format.printf(info => `${info.level}: ${info.message}`),
        winstonLogger = winston.createLogger({
            level: options.loglevel,
            transports: [new winston.transports.Console({
                format: format.combine(format.colorize(), consoleFormat)
            })]
        }),
        thisPackage = require('../package.json'),
        releases = require('../releases.json'),
        ScopedLogger = require('./util/scopedLogger'),
        util = require('util'),
        helpers = require('./util/helpers'),
        deferred = Q.defer(),
        app = express(),
        imposters = options.imposters || {},
        protocols = {
            tcp: require('./models/tcp/tcpServer').initialize(winstonLogger, options.mock, options.debug),
            http: require('./models/http/httpServer').initialize(winstonLogger, options.mock, options.debug),
            https: require('./models/https/httpsServer').initialize(winstonLogger, options.mock, options.debug),
            smtp: require('./models/smtp/smtpServer').initialize(winstonLogger, options.mock, options.debug),
            foo: require('./models/foo/fooServer').initialize(winstonLogger, options.mock, options.debug)
        },
        logger = ScopedLogger.create(winstonLogger, util.format('[mb:%s] ', options.port)),
        homeController = HomeController.create(releases),
        impostersController = ImpostersController.create(protocols, imposters, Imposter, logger, options.allowInjection),
        imposterController = ImposterController.create(imposters),
        logsController = LogsController.create(options.logfile),
        configController = ConfigController.create(thisPackage.version, options),
        feedController = FeedController.create(releases, options),
        validateImposterExists = middleware.createImposterValidator(imposters),
        localIPs = ['::ffff:127.0.0.1', '::1', '127.0.0.1'],
        allowedIPs = localIPs.concat(options.ipWhitelist);

    if (!options.nologfile) {
        initializeLogfile(options.logfile);
        winstonLogger.add(new winston.transports.File({
            filename: options.logfile,
            maxsize: '20m',
            maxFiles: 5,
            tailable: true,
            format: format.combine(format.timestamp(), format.json())
        }));
    }

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger(logger, ':method :url'));
    app.use(middleware.globals({ heroku: options.heroku, port: options.port, version: thisPackage.version }));
    app.use(middleware.defaultIEtoHTML);
    app.use(middleware.json(logger));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, '../node_modules')));
    app.use(errorHandler());
    app.use(cors());

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
    app.delete('/imposters/:id/savedProxyResponses', imposterController.resetProxies);
    app.delete('/imposters/:id/requests', imposterController.resetProxies); // deprecated but saved for backwards compatibility

    app.get('/logs', logsController.get);
    app.get('/config', configController.get);
    app.get('/feed', feedController.getFeed);
    app.get('/releases', feedController.getReleases);
    app.get('/releases/:version', feedController.getRelease);

    app.get('/sitemap', (request, response) => {
        response.type('text/plain');
        response.render('sitemap', { releases: releases });
    });

    [
        '/support',
        '/license',
        '/faqs',
        '/thoughtworks',
        '/docs/gettingStarted',
        '/docs/install',
        '/docs/mentalModel',
        '/docs/commandLine',
        '/docs/clientLibraries',
        '/docs/security',
        '/docs/api/overview',
        '/docs/api/contracts',
        '/docs/api/mocks',
        '/docs/api/stubs',
        '/docs/api/predicates',
        '/docs/api/xpath',
        '/docs/api/json',
        '/docs/api/jsonpath',
        '/docs/api/proxies',
        '/docs/api/injection',
        '/docs/api/behaviors',
        '/docs/api/errors',
        '/docs/protocols/http',
        '/docs/protocols/https',
        '/docs/protocols/tcp',
        '/docs/protocols/smtp'
    ].forEach(endpoint => {
        app.get(endpoint, (request, response) => {
            response.render(endpoint.substring(1));
        });
    });

    function isAllowedConnection (ipAddress) {
        return allowedIPs.some(allowedIP => allowedIP === '*' || allowedIP.toLowerCase() === ipAddress.toLowerCase());
    }

    function hostname () {
        if (options.localOnly) {
            return 'localhost';
        }
        else if (options.host) {
            return options.host;
        }
        else {
            return undefined;
        }
    }

    const connections = {},
        server = app.listen(options.port, hostname(), () => {
            logger.info('mountebank v%s now taking orders - point your browser to http://localhost:%s for help',
                thisPackage.version, options.port);
            logger.debug(`config: ${JSON.stringify({
                options: options,
                process: {
                    nodeVersion: process.version,
                    architecture: process.arch,
                    platform: process.platform
                }
            })}`);
            if (options.allowInjection) {
                logger.warn('Running with --allowInjection set. See http://localhost:%s/docs/security for security info',
                    options.port);
            }

            server.on('connection', socket => {
                const name = helpers.socketName(socket);
                connections[name] = socket;

                socket.on('close', () => {
                    delete connections[name];
                });

                socket.on('error', error => {
                    logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
                });

                if (!isAllowedConnection(socket.address().address)) {
                    logger.warn('Blocking incoming connection from %s. Add to --ipWhitelist to allow',
                        socket.address().address);
                    socket.end();
                }
            });

            deferred.resolve({
                close: callback => {
                    server.close(() => {
                        logger.info('Adios - see you soon?');
                        callback();
                    });

                    // Force kill any open connections to prevent process hanging
                    Object.keys(connections).forEach(socket => {
                        connections[socket].destroy();
                    });
                }
            });
        });

    return deferred.promise;
}

module.exports = { create };
