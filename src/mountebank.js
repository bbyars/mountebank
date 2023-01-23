'use strict';

const express = require('express'),
    cors = require('cors'),
    promClient = require('prom-client'),
    errorHandler = require('errorhandler'),
    path = require('path'),
    middleware = require('./util/middleware'),
    thisPackage = require('../package.json'),
    releases = require('../releases.json'),
    helpers = require('./util/helpers.js'),
    utilLogger = require('./util/logger.js'),
    utilIp = require('./util/ip.js'),
    protocolsModule = require('./models/protocols.js'),
    imposterRepositoryModule = require('./models/impostersRepository.js'),
    homeControllerModule = require('./controllers/homeController.js'),
    impostersControllerModule = require('./controllers/impostersController.js'),
    imposterControllerModule = require('./controllers/imposterController.js'),
    logsControllerModule = require('./controllers/logsController.js'),
    configControllerModule = require('./controllers/configController.js'),
    feedControllerModule = require('./controllers/feedController.js');

/**
 * The entry point for mountebank.  This module creates the mountebank server,
 * configures all middleware and manages all routing
 * @module
 */

/**
 * Creates the mountebank express application
 * @param {object} options - The command line options
 * @returns {Object} An object with a close method to stop the server
 */

function applyDefaults (options) {
    // Minimal defaults to start bypassing the CLI (e.g. embedding in an express app)
    const defaults = {
        port: 2525,
        ipWhitelist: ['*']
    };
    Object.keys(defaults).forEach(key => {
        options[key] = typeof options[key] === 'undefined' ? defaults[key] : options[key];
    });
}

async function createApp (options) {
    applyDefaults(options);

    const app = express(),
        hostname = options.host || 'localhost',
        baseURL = `http://${hostname}:${options.port}`,
        logger = utilLogger.createLogger(options),
        isAllowedConnection = utilIp.createIPVerification(options),
        imposters = imposterRepositoryModule.create(options, logger),
        protocols = protocolsModule.loadProtocols(options, baseURL, logger, isAllowedConnection, imposters),
        homeController = homeControllerModule.create(releases),
        impostersController = impostersControllerModule.create(
            protocols, imposters, logger, options.allowInjection),
        imposterController = imposterControllerModule.create(
            protocols, imposters, logger, options.allowInjection),
        logfile = options.log.transports.file ? options.log.transports.file.path : false,
        logsController = logsControllerModule.create(logfile),
        configController = configControllerModule.create(thisPackage.version, options),
        feedController = feedControllerModule.create(releases),
        validateImposterExists = middleware.createImposterValidator(imposters),
        prometheus = promClient;

    // Clear only matters when bound using directly in-process through JS rather than the CLI
    prometheus.register.clear();
    prometheus.collectDefaultMetrics({ prefix: 'mb_' });

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.validateApiKey(options.apikey, logger));
    app.use(middleware.logger(logger, ':method :url'));
    app.use(middleware.globals({ port: options.port, version: thisPackage.version }));
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
        const register = promClient.register;
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
        '/docs/mentalModel',
        '/docs/commandLine',
        '/docs/communityExtensions',
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
        '/docs/api/faults',
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

    await imposters.loadAll(protocols);

    return app;
}

/**
 * Start the mountebank server
 * @param {function} app - mountebank express application
 * @param {object} options - The command line options
 * @returns {Object} An object with a close method to stop the server
 */
async function listen (app, options) {
    const hostname = options.host || 'localhost',
        baseURL = `http://${hostname}:${options.port}`,
        logger = utilLogger.createLogger(options),
        isAllowedConnection = utilIp.createIPVerification(options);

    return new Promise(resolve => {
        const connections = {},
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

                resolve({
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
                logger.error(`${name} transmission error X=> ${JSON.stringify(error)}`);
            });

            if (!isAllowedConnection(ipAddress, logger)) {
                socket.destroy();
            }
        });
    });
}

/**
 * Creates the mountebank server
 * @param {object} options - The command line options
 * @returns {Object} An object with a close method to stop the server
 */
async function create (options) {
    const app = await createApp(options);
    return listen(app, options);
}

module.exports = { create, createApp };
