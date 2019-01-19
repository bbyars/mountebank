'use strict';

function create (Protocol, creationRequest, imposterUrl, recordMatches, logger) {
    const { spawn } = require('child_process'),
        command = Protocol.createCommand.split(' ')[0],
        args = Protocol.createCommand.split(' ').splice(1),
        port = creationRequest.port,
        callbackUrl = `${imposterUrl}/_requests`,
        defaultResponse = creationRequest.defaultResponse || {},
        allArgs = args.concat(port, callbackUrl, JSON.stringify(defaultResponse)),
        imposterProcess = spawn(command, allArgs),
        resolver = require('./responseResolver').create(undefined, callbackUrl),
        stubs = require('./stubRepository').create(resolver, recordMatches, 'utf8'),
        Q = require('q'),
        deferred = Q.defer();

    if (creationRequest.stubs) {
        creationRequest.stubs.forEach(stubs.addStub);
    }

    imposterProcess.stdout.once('data', () => {
        logger.info('Open for business...');

        deferred.resolve({
            stubs,
            resolver,
            stop: () => {
                const stopDeferred = Q.defer();
                imposterProcess.once('exit', () => {
                    logger.info('Ciao for now');
                    stopDeferred.resolve({});
                });
                imposterProcess.kill();
                return stopDeferred.promise;
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
}

module.exports = { create };
