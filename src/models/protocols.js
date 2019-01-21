'use strict';

function load (options, callbackUrlFn) {
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

    function outOfProcessCreate (createCommand) {
        return (creationRequest, logger) => {
            const { spawn } = require('child_process'),
                command = createCommand.split(' ')[0],
                args = createCommand.split(' ').splice(1),
                port = creationRequest.port,
                defaultResponse = creationRequest.defaultResponse || {},
                allArgs = args.concat(port, callbackUrlFn(port), JSON.stringify(defaultResponse)),
                imposterProcess = spawn(command, allArgs),
                stubs = require('./stubRepository').create('utf8'),
                resolver = require('./responseResolver').create(stubs, undefined, callbackUrlFn(port)),
                Q = require('q'),
                deferred = Q.defer();

            imposterProcess.stdout.once('data', () => {
                deferred.resolve({
                    port: creationRequest.port,
                    metadata: {},
                    stubs,
                    resolver,
                    close: callback => {
                        imposterProcess.once('exit', () => {
                            callback();
                        });
                        imposterProcess.kill();
                    }
                });
            });

            imposterProcess.stdout.on('data', buffer => {
                const data = buffer.toString('utf8');
                if (data.indexOf(' ') > 0) {
                    const words = data.split(' '),
                        level = words[0],
                        rest = words.splice(1).join(' ').trim();
                    logger[level](rest);
                }
            });

            imposterProcess.stderr.on('data', data => {
                logger.error(data);
            });

            process.once('SIGINT', () => {
                imposterProcess.kill();
            });
            process.once('SIGTERM', () => {
                imposterProcess.kill();
            });

            return deferred.promise;
        };
    }

    const result = {
            tcp: require('./tcp/tcpServer'),
            http: require('./http/httpServer'),
            https: require('./https/httpsServer'),
            smtp: require('./smtp/smtpServer')
        },
        fs = require('fs'),
        path = require('path'),
        protofile = path.join(process.cwd(), options.protofile);

    Object.keys(result).forEach(key => {
        result[key].createServer = inProcessCreate(result[key].create);
    });
    if (fs.existsSync(protofile)) {
        const customProtocols = require(protofile);
        Object.keys(customProtocols).forEach(key => {
            result[key] = customProtocols[key];
            result[key].createServer = outOfProcessCreate(result[key].createCommand);
        });
    }
    return result;
}

module.exports = { load };
