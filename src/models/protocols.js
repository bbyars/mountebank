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
                    resolver: resolver,
                    stubs: stubs,
                    close: server.close
                });
            });
    }

    function outOfProcessCreate (protocolName, config) {
        function metadataFor (creationRequest) {
            const result = {};
            (config.metadata || []).forEach(key => {
                if (typeof creationRequest[key] !== 'undefined') {
                    result[key] = creationRequest[key];
                }
            });
            return result;
        }

        return (creationRequest, logger) => {
            const { spawn } = require('child_process'),
                command = config.createCommand.split(' ')[0],
                args = config.createCommand.split(' ').splice(1),
                port = creationRequest.port,
                defaultResponse = creationRequest.defaultResponse || {},
                creationMetadata = metadataFor(creationRequest),
                allArgs = args.concat(port, callbackUrlFn(port), JSON.stringify(defaultResponse), JSON.stringify(creationMetadata)),
                imposterProcess = spawn(command, allArgs),
                stubs = require('./stubRepository').create(config.encoding || 'utf8'),
                resolver = require('./responseResolver').create(stubs, undefined, callbackUrlFn(port)),
                Q = require('q'),
                deferred = Q.defer(),
                kill = () => { imposterProcess.kill(); };

            imposterProcess.on('error', error => {
                const errors = require('../util/errors'),
                    message = `Invalid implementation for protocol "${protocolName}": cannot run "${config.createCommand}"`;
                logger.error(message);
                deferred.reject(errors.ProtocolImplementationError(message, { source: config.createCommand, details: error }));
            });

            process.once('SIGINT', kill);
            process.once('SIGTERM', kill);

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

                deferred.resolve({
                    port: serverPort,
                    metadata: metadata,
                    stubs,
                    resolver,
                    close: callback => {
                        imposterProcess.once('exit', () => {
                            callback();
                        });
                        kill();
                    }
                });
            }

            imposterProcess.stdout.on('data', buffer => {
                const lines = buffer.toString('utf8').trim().split('\n');
                lines.forEach(line => {
                    if (deferred.promise.isPending()) {
                        resolveWithMetadata(line);
                    }
                    if (line.indexOf(' ') > 0) {
                        const words = line .split(' '),
                            level = words[0],
                            rest = words.splice(1).join(' ').trim();
                        if (['debug', 'info', 'warn', 'error'].indexOf(level) >= 0) {
                            logger[level](rest);
                        }
                    }
                });
            });

            imposterProcess.stderr.on('data', data => {
                logger.error(data);
            });

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
