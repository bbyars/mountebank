'use strict';

/**
 * The entry point for mountebank.  This module creates the mountebank server,
 * configures all middleware, starts the logger, and manages all routing
 * @module
 */

function initializeLogfile (filename) {
    // Ensure new logfile on startup so the /logs only shows for this process
    var path = require('path'),
        fs = require('fs'),
        extension = path.extname(filename),
        pattern = new RegExp(extension + '$'),
        newFilename = filename.replace(pattern, '1' + extension);

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
    var Q = require('q'),
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
        thisPackage = require('../package.json'),
        releases = require('../releases.json'),
        ScopedLogger = require('./util/scopedLogger'),
        util = require('util'),
        helpers = require('./util/helpers'),
        deferred = Q.defer(),
        app = express(),
        imposters = options.imposters || {},
        protocols = {
            tcp: require('./models/tcp/tcpServer').initialize(options.allowInjection, options.mock, options.debug),
            http: require('./models/http/httpServer').initialize(options.allowInjection, options.mock, options.debug),
            https: require('./models/https/httpsServer').initialize(options.allowInjection, options.mock, options.debug),
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
        localIPs = ['::ffff:127.0.0.1', '::1', '127.0.0.1'],
        allowedIPs = localIPs.concat(options.ipWhitelist);

    logger.remove(logger.transports.Console);
    if (process.stdout.isTTY) {
        logger.add(logger.transports.Console, { colorize: true, level: options.loglevel });
    }
    if (!options.nologfile) {
        initializeLogfile(options.logfile);
        logger.add(logger.transports.File, {
            filename: options.logfile,
            timestamp: true,
            level: options.loglevel,
            maxsize: 10000000,
            maxFiles: 1
        });
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
        '/license',
        '/faqs',
        '/thoughtworks',
        '/docs/examples',
        '/docs/gettingStarted',
        '/docs/install',
        '/docs/glossary',
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
    ].forEach(function (endpoint) {
        app.get(endpoint, function (request, response) {
            response.render(endpoint.substring(1));
        });
    });

    function portStored (saveImpostersFile, saveImpostersFileFlag, impDirectory) {
        var fs = require('fs');
        var portStore = [];
        if (impDirectory === null) {
            var ImposterDir = './Repository_Template';
        }
        else {
            ImposterDir = impDirectory;
        }
        if (fs.existsSync(ImposterDir + '/' + saveImpostersFile) === true) {
            var textFinal = fs.readFileSync(ImposterDir + '/' + saveImpostersFile, 'utf-8');
            if ((saveImpostersFileFlag) && (textFinal !== '')) {
                var parseImposter = JSON.parse(textFinal);
                (parseImposter.imposters).forEach(function (parse) {
                    portStore.push(parse.port);
                });
                if (portStore.length >= 1) {
                    logger.warn('These ports are already used ' + portStore + ' use unique ports for imposters. Check ' + ImposterDir + '/' + saveImpostersFile + ' for stored imposter collections');

                }
            }
        }
        else {

            if (!fs.existsSync(ImposterDir)) {
                fs.mkdirSync(ImposterDir);
            }
            fs.writeFileSync(ImposterDir + '/' + saveImpostersFile, '');
        }
    }

    function saveImposterFile () {
        var parsePath = path.parse(options.savefile);
        var getDirName = parsePath.dir;
        var lastExtName = parsePath.base;
        if ((options.savefile === true) && (options.savefile !== undefined)) {
            var saveImpostersFile = 'mb.json';
            module.exports.saveImpostersFile = saveImpostersFile;
            var saveImpostersFileFlag = 'true';
            module.exports.saveImpostersFileFlag = saveImpostersFileFlag;
            portStored(saveImpostersFile, saveImpostersFileFlag, null);
        }
        else if (getDirName !== '') {
            saveImpostersFile = lastExtName;
            module.exports.saveImpostersFile = lastExtName;
            module.exports.ImposterDir = getDirName;
            saveImpostersFileFlag = 'true';
            module.exports.saveImpostersFileFlag = saveImpostersFileFlag;
            portStored(saveImpostersFile, saveImpostersFileFlag, getDirName);
        }

        else if ((options.savefile !== true) && (options.savefile !== undefined) && (options.savefile !== 'mb.json')) {
            saveImpostersFile = options.savefile;
            module.exports.saveImpostersFile = saveImpostersFile;
            saveImpostersFileFlag = 'true';
            module.exports.saveImpostersFileFlag = saveImpostersFileFlag;
            portStored(saveImpostersFile, saveImpostersFileFlag, null);
        }
        else if ((options.savefile).localeCompare('mb.json') === 0) {
            module.exports.saveImpostersFileFlag = 'false';
        }
    }


    function isAllowedConnection (ipAddress) {
        return allowedIPs.some(function (allowedIP) {
            return allowedIP === '*' || allowedIP.toLowerCase() === ipAddress.toLowerCase();
        });
    }

    var host = options.localOnly ? 'localhost' : undefined,
        connections = {},
        server = app.listen(options.port, host, function () {
            logger.info('mountebank v%s now taking orders - point your browser to http://localhost:%s for help',
                thisPackage.version, options.port);
            // invert dependency of the export of the serverPort
            var serverPort;
            serverPort = JSON.stringify(options.port);
            module.exports.serverPort = serverPort;

            saveImposterFile(options.savefile);
            logger.debug('config: ' + JSON.stringify({
                options: options,
                process: {
                    nodeVersion: process.version,
                    architecture: process.arch,
                    platform: process.platform
                }
            }));
            if (options.allowInjection) {
                logger.warn('Running with --allowInjection set. See http://localhost:%s/docs/security for security info',
                    options.port);
            }

            server.on('connection', function (socket) {
                var name = helpers.socketName(socket);
                connections[name] = socket;

                socket.on('close', function () {
                    delete connections[name];
                });

                if (!isAllowedConnection(socket.address().address)) {
                    logger.warn('Blocking incoming connection from %s. Add to --ipWhitelist to allow',
                        socket.address().address);
                    socket.end();
                }
            });

            deferred.resolve({
                close: function (callback) {
                    server.close(function () {
                        logger.info('Adios - see you soon?');
                        callback();
                    });

                    // Force kill any open connections to prevent process hanging
                    Object.keys(connections).forEach(function (socket) {
                        connections[socket].destroy();
                    });
                }
            });
        });

    return deferred.promise;
}

module.exports = {
    create: create
};
