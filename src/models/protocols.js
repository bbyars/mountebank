'use strict';

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
        return (creationRequest, logger, responseFn) =>
            createProtocol(creationRequest, logger, responseFn).then(server => {
                const stubs = impostersRepository.stubsFor(server.port),
                    resolver = require('./responseResolver').create(stubs, server.proxy),
                    Q = require('q');

                return Q({
                    port: server.port,
                    metadata: server.metadata,
                    stubs: stubs,
                    resolver: resolver,
                    close: server.close,
                    encoding: server.encoding || 'utf8'
                });
            });
    }

    function outOfProcessCreate (protocolName, config) {
        function customFieldsFor (creationRequest) {
            const result = {},
                commonFields = ['protocol', 'port', 'name', 'recordRequests', 'stubs', 'defaultResponse'];
            Object.keys(creationRequest).forEach(key => {
                if (commonFields.indexOf(key) < 0) {
                    result[key] = creationRequest[key];
                }
            });
            return result;
        }

        return (creationRequest, logger) => {
            const Q = require('q'),
                deferred = Q.defer(),
                { spawn } = require('child_process'),
                command = config.createCommand.split(' ')[0],
                args = config.createCommand.split(' ').splice(1),
                port = creationRequest.port,
                commonArgs = {
                    port,
                    callbackURLTemplate: options.callbackURLTemplate,
                    loglevel: options.loglevel,
                    allowInjection: options.allowInjection
                },
                configArgs = require('../util/helpers').merge(commonArgs, customFieldsFor(creationRequest));

            if (typeof creationRequest.defaultResponse !== 'undefined') {
                configArgs.defaultResponse = creationRequest.defaultResponse;
            }

            const allArgs = args.concat(JSON.stringify(configArgs)),
                imposterProcess = spawn(command, allArgs);

            let closeCalled = false;

            imposterProcess.on('error', error => {
                const errors = require('../util/errors'),
                    message = `Invalid configuration for protocol "${protocolName}": cannot run "${config.createCommand}"`;
                deferred.reject(errors.ProtocolError(message,
                    { source: config.createCommand, details: error }));
            });

            imposterProcess.once('exit', code => {
                if (code !== 0 && deferred.promise.isPending()) {
                    const errors = require('../util/errors'),
                        message = `"${protocolName}" start command failed (exit code ${code})`;
                    deferred.reject(errors.ProtocolError(message, { source: config.createCommand }));
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
                    resolver = require('./responseResolver').create(stubs, undefined, callbackURL);

                delete metadata.encoding;

                deferred.resolve({
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
                const lines = data.toString('utf8').trim().split('\n');
                lines.forEach(line => {
                    if (deferred.promise.isPending()) {
                        resolveWithMetadata(line);
                    }
                    log(line);
                });
            });

            imposterProcess.stderr.on('data', logger.error);

            return deferred.promise;
        };
    }

    function createImposter (Protocol, creationRequest) {
        const Imposter = require('./imposter');
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

module.exports = { load };
