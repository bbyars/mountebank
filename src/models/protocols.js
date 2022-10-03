'use strict';

const responseResolver = require('./responseResolver'),
    childProcess = require('child_process'),
    fsExtra = require('fs-extra'),
    path = require('path'),
    errors = require('../util/errors.js'),
    Imposter = require('./imposter.js'),
    helpers = require('../util/helpers.js'),
    tcpServer = require('./tcp/tcpServer.js'),
    httpServer = require('./http/httpServer.js'),
    httpsServer = require('./https/httpsServer.js'),
    smtpServer = require('./smtp/smtpServer.js');

/**
 * Abstracts the protocol configuration between the built-in in-memory implementations and out of process
 * implementations
 * @module
 */

/**
 * Loads the imposter creation functions for all built in and custom protocols
 * @param builtInProtocols {Object} - the in-memory protocol implementations that ship with mountebank
 * @param customProtocols {Object} - custom out-of-process protocol implementations
 * @param options {Object} - command line configuration
 * @param isAllowedConnection {Function} - a function that determines whether the connection is allowed or not for security verification
 * @param mbLogger {Object} - the logger
 * @param impostersRepository {Object} - the imposters repository
 * @returns {Object} - a map of protocol name to creation functions
 */
// eslint-disable-next-line max-params
function load (builtInProtocols, customProtocols, options, isAllowedConnection, mbLogger, impostersRepository) {
    function inProcessCreate (createProtocol) {
        return async (creationRequest, logger, responseFn) => {
            const server = await createProtocol(creationRequest, logger, responseFn),
                stubs = impostersRepository.stubsFor(server.port),
                resolver = responseResolver.create(stubs, server.proxy);

            return {
                port: server.port,
                metadata: server.metadata,
                stubs: stubs,
                resolver: resolver,
                close: server.close,
                encoding: server.encoding || 'utf8'
            };
        };
    }

    function outOfProcessCreate (protocolName, config) {
        function customFieldsFor (creationRequest) {
            const fields = {},
                commonFields = ['protocol', 'port', 'name', 'recordRequests', 'stubs', 'defaultResponse'];
            Object.keys(creationRequest).forEach(key => {
                if (commonFields.indexOf(key) < 0) {
                    fields[key] = creationRequest[key];
                }
            });
            return fields;
        }

        return (creationRequest, logger) => new Promise((res, rej) => {
            let isPending = true;
            const { spawn } = childProcess,
                command = config.createCommand.split(' ')[0],
                args = config.createCommand.split(' ').splice(1),
                port = creationRequest.port,
                commonArgs = {
                    port,
                    callbackURLTemplate: options.callbackURLTemplate,
                    loglevel: options.loglevel,
                    allowInjection: options.allowInjection
                },
                configArgs = helpers.merge(commonArgs, customFieldsFor(creationRequest)),
                resolve = obj => {
                    isPending = false;
                    res(obj);
                },
                reject = err => {
                    isPending = false;
                    rej(err);
                };

            if (typeof creationRequest.defaultResponse !== 'undefined') {
                configArgs.defaultResponse = creationRequest.defaultResponse;
            }

            const allArgs = args.concat(JSON.stringify(configArgs)),
                imposterProcess = spawn(command, allArgs);

            let closeCalled = false;

            imposterProcess.on('error', error => {
                const message = `Invalid configuration for protocol "${protocolName}": cannot run "${config.createCommand}"`;

                reject(errors.ProtocolError(message,
                    { source: config.createCommand, details: error }));
            });

            imposterProcess.once('exit', code => {
                if (code !== 0 && isPending) {
                    const message = `"${protocolName}" start command failed (exit code ${code})`;

                    reject(errors.ProtocolError(message, { source: config.createCommand }));
                }
                else if (!closeCalled) {
                    logger.error("Uh oh! I've crashed! Expect subsequent requests to fail.");
                }
            });

            function resolveWithMetadata (possibleJSON) {
                let metadata = {};

                try {
                    metadata = JSON.parse(possibleJSON);
                }
                catch (error) { /* do nothing */ }

                let serverPort = creationRequest.port;
                if (metadata.port) {
                    serverPort = metadata.port;
                    delete metadata.port;
                }
                const callbackURL = options.callbackURLTemplate.replace(':port', serverPort),
                    encoding = metadata.encoding || 'utf8',
                    stubs = impostersRepository.stubsFor(serverPort),
                    resolver = responseResolver.create(stubs, undefined, callbackURL);

                delete metadata.encoding;

                resolve({
                    port: serverPort,
                    metadata: metadata,
                    stubs,
                    resolver,
                    encoding,
                    close: callback => {
                        closeCalled = true;
                        imposterProcess.once('exit', callback);
                        imposterProcess.kill();
                    }
                });
            }

            function log (message) {
                if (message.indexOf(' ') > 0) {
                    const words = message.split(' '),
                        level = words[0],
                        rest = words.splice(1).join(' ').trim();
                    if (['debug', 'info', 'warn', 'error'].indexOf(level) >= 0) {
                        logger[level](rest);
                    }
                }
            }

            imposterProcess.stdout.on('data', data => {
                const lines = data.toString('utf8').trim().split(/\r?\n/);
                lines.forEach(line => {
                    if (isPending) {
                        resolveWithMetadata(line);
                    }
                    log(line);
                });
            });

            imposterProcess.stderr.on('data', logger.error);
        });
    }

    function createImposter (Protocol, creationRequest) {
        return Imposter.create(Protocol, creationRequest, mbLogger.baseLogger, options, isAllowedConnection);
    }

    const result = {};
    Object.keys(builtInProtocols).forEach(key => {
        result[key] = builtInProtocols[key];
        result[key].createServer = inProcessCreate(result[key].create);
        result[key].createImposterFrom = creationRequest => createImposter(result[key], creationRequest);
    });
    Object.keys(customProtocols).forEach(key => {
        result[key] = customProtocols[key];
        result[key].createServer = outOfProcessCreate(key, result[key]);
        result[key].createImposterFrom = creationRequest => createImposter(result[key], creationRequest);
    });
    return result;
}

function isBuiltInProtocol (protocol) {
    return ['tcp', 'smtp', 'http', 'https'].indexOf(protocol) >= 0;
}

function loadCustomProtocols (protofile, logger) {
    if (typeof protofile === 'undefined') {
        return {};
    }

    const filename = path.resolve(path.relative(process.cwd(), protofile));

    if (fsExtra.existsSync(filename)) {
        try {
            const customProtocols = require(filename);
            Object.keys(customProtocols).forEach(proto => {
                if (isBuiltInProtocol(proto)) {
                    logger.warn(`Using custom ${proto} implementation instead of the built-in one`);
                }
                else {
                    logger.info(`Loaded custom protocol ${proto}`);
                }
            });
            return customProtocols;
        }
        catch (e) {
            logger.error(`${protofile} contains invalid JSON -- no custom protocols loaded`);
            return {};
        }
    }
    else {
        return {};
    }
}

function loadProtocols (options, baseURL, logger, isAllowedConnection, imposters) {
    const builtInProtocols = {
            tcp: tcpServer,
            http: httpServer,
            https: httpsServer,
            smtp: smtpServer
        },
        customProtocols = loadCustomProtocols(options.protofile, logger),
        config = {
            callbackURLTemplate: `${baseURL}/imposters/:port/_requests`,
            recordRequests: options.mock,
            recordMatches: options.debug,
            loglevel: options.log.level,
            allowInjection: options.allowInjection,
            host: options.host
        };

    return load(builtInProtocols, customProtocols, config, isAllowedConnection, logger, imposters);
}

module.exports = { load, loadProtocols };
