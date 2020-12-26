'use strict';

/**
 * The entry point for mountebank.  This module creates the mountebank server,
 * configures all middleware and manages all routing
 * @module
 */

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
        thisPackage = require('../package.json'),
        releases = require('../releases.json'),
        helpers = require('./util/helpers'),
        app = express(),
        hostname = options.host || 'localhost',
        baseURL = `http://${hostname}:${options.port}`,
        logger = require('./util/logger').createLogger(options),
        isAllowedConnection = require('./util/ip').createIPVerification(options),
        imposters = require('./models/impostersRepository').create(options, logger),
        protocols = require('./models/protocols').loadProtocols(options, baseURL, logger, isAllowedConnection, imposters),
        homeController = require('./controllers/homeController').create(releases),
        impostersController = require('./controllers/impostersController').create(
            protocols, imposters, logger, options.allowInjection),
        imposterController = require('./controllers/imposterController').create(
            protocols, imposters, logger, options.allowInjection),
        logfile = options.log.transports.file ? options.log.transports.file.path : false,
        logsController = require('./controllers/logsController').create(logfile),
        configController = require('./controllers/configController').create(thisPackage.version, options),
        feedController = require('./controllers/feedController').create(releases, options),
        validateImposterExists = middleware.createImposterValidator(imposters),
        fs = require('fs-extra'),
        prometheus = require('prom-client');

    prometheus.collectDefaultMetrics({ prefix: 'mb_' });

    function loadAllImpostersFromDatabase () {
        if (!options.datadir || !fs.existsSync(options.datadir)) {
            return Q();
        }

        const dirs = fs.readdirSync(options.datadir),
            promises = dirs.map(dir => {
                const imposterFilename = `${options.datadir}/${dir}/imposter.json`;
                if (!fs.existsSync(imposterFilename)) {
                    logger.warn(`Skipping ${dir} during loading; missing imposter.json`);
                    return Q();
                }

                const config = JSON.parse(fs.readFileSync(imposterFilename)),
                    protocol = protocols[config.protocol];

                if (protocol) {
                    logger.info(`Loading ${config.protocol}:${dir} from datadir`);
                    return protocol.createImposterFrom(config)
                        .then(imposter => imposters.addReference(imposter));
                }
                else {
                    logger.error(`Cannot load imposter ${dir}; no protocol loaded for ${config.protocol}`);
                    return Q();
                }
            });
        return Q.all(promises);
    }

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger(logger, ':method :url'));
    app.use(middleware.globals({ heroku: options.heroku, port: options.port, version: thisPackage.version }));
    app.use(middleware.defaultIEtoHTML);
    app.use(middleware.json(logger));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, '../node_modules')));
    app.use(errorHandler());
    app.use(cors({ origin: options.origin }));

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
    app.delete('/imposters/:id/savedProxyResponses', validateImposterExists, imposterController.resetProxies);
    app.delete('/imposters/:id/savedRequests', validateImposterExists, imposterController.resetRequests);

    // deprecated but saved for backwards compatibility
    app.delete('/imposters/:id/requests', validateImposterExists, imposterController.resetProxies);

    // Changing stubs without restarting imposter
    app.put('/imposters/:id/stubs', validateImposterExists, imposterController.putStubs);
    app.put('/imposters/:id/stubs/:stubIndex', validateImposterExists, imposterController.putStub);
    app.post('/imposters/:id/stubs', validateImposterExists, imposterController.postStub);
    app.delete('/imposters/:id/stubs/:stubIndex', validateImposterExists, imposterController.deleteStub);

    // Protocol implementation APIs
    app.post('/imposters/:id/_requests', validateImposterExists, imposterController.postRequest);
    app.post('/imposters/:id/_requests/:proxyResolutionKey', validateImposterExists, imposterController.postProxyResponse);

    app.get('/logs', logsController.get);
    app.get('/config', configController.get);
    app.get('/feed', feedController.getFeed);
    app.get('/releases', feedController.getReleases);
    app.get('/releases/:version', feedController.getRelease);

    app.get('/metrics', async function (request, response) {
        const register = require('prom-client').register;
        response.set('Content-Type', register.contentType);
        response.end(await register.metrics());
    });

    app.get('/sitemap', (request, response) => {
        response.type('text/plain');
        response.render('sitemap', { releases: releases });
    });

    [
        '/support',
        '/license',
        '/faqs',
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
        '/docs/protocols/smtp',
        '/docs/protocols/custom'
    ].forEach(endpoint => {
        app.get(endpoint, (request, response) => {
            response.render(endpoint.substring(1));
        });
    });

    process.once('exit', () => {
        imposters.stopAllSync();
    });

    if (options.allowInjection) {
        logger.warn(`Running with --allowInjection set. See ${baseURL}/docs/security for security info`);
    }

    return loadAllImpostersFromDatabase().then(() => {
        const deferred = Q.defer(),
            connections = {},
            server = app.listen(options.port, options.host, () => {
                logger.info(`mountebank v${thisPackage.version} now taking orders - point your browser to ${baseURL}/ for help`);
                logger.debug(`config: ${JSON.stringify({
                    options: options,
                    process: {
                        nodeVersion: process.version,
                        architecture: process.arch,
                        platform: process.platform
                    }
                })}`);

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

        server.on('connection', socket => {
            const name = helpers.socketName(socket),
                ipAddress = socket.remoteAddress;
            connections[name] = socket;

            socket.on('close', () => {
                delete connections[name];
            });

            socket.on('error', error => {
                logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
            });

            if (!isAllowedConnection(ipAddress, logger)) {
                socket.destroy();
            }
        });

        return deferred.promise;
    });
}

module.exports = { create };
