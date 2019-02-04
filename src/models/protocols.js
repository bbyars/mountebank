'use strict';

function load (builtInProtocols, customProtocols, callbackUrlFn) {
    function inProcessCreate (createProtocol) {
        return (creationRequest, logger, responseFn) =>
            createProtocol(creationRequest, logger, responseFn).then(server => {
                const stubs = require('./stubRepository').create(server.encoding || 'utf8'),
                    resolver = require('./responseResolver').create(stubs, server.proxy),
                    Q = require('q');

                return Q({
                    port: server.port,
                    metadata: server.metadata,
                    stubs: stubs,
                    resolver: resolver,
                    close: server.close
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
                defaultResponse = creationRequest.defaultResponse || {},
                configArgs = require('../util/helpers').merge(
                    { port, defaultResponse, callbackURL: callbackUrlFn(port) },
                    customFieldsFor(creationRequest)),
                allArgs = args.concat(JSON.stringify(configArgs)),
                imposterProcess = spawn(command, allArgs);

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

                const stubs = require('./stubRepository').create(metadata.encoding || 'utf8'),
                    resolver = require('./responseResolver').create(stubs, undefined, callbackUrlFn(serverPort));

                deferred.resolve({
                    port: serverPort,
                    metadata: metadata,
                    stubs,
                    resolver,
                    close: callback => {
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

    const result = {};
    Object.keys(builtInProtocols).forEach(key => {
        result[key] = builtInProtocols[key];
        result[key].createServer = inProcessCreate(result[key].create);
    });
    Object.keys(customProtocols).forEach(key => {
        result[key] = customProtocols[key];
        result[key].createServer = outOfProcessCreate(key, result[key]);
    });
    return result;
}

module.exports = { load };
