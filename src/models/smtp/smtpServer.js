'use strict';

/**
 * Represents an smtp imposter
 * @module
 */

function createServer () {
    function createSMTPServer (server) {
        const SMTPServer = require('smtp-server').SMTPServer;
        return new SMTPServer({
            disableReverseLookup: true,
            authOptional: true,
            onConnect (session, callback) {
                server.emit('connection', session);
                return callback();
            },
            onData (stream, session, callback) {
                server.emit('request', session, { session: session, source: stream, callback: callback });
            }
        });
    }

    const combinators = require('../../util/combinators'),
        inherit = require('../../util/inherit'),
        result = inherit.from(require('events').EventEmitter, {
            errorHandler: require('../../util/combinators').noop,
            formatRequestShort: request => {
                const util = require('util');
                return util.format('Envelope from: %s to: %s', request.from, JSON.stringify(request.to));
            },
            formatRequest: combinators.identity,
            formatResponse: combinators.noop,
            respond: (smtpRequest, originalRequest) => { originalRequest.callback(); },
            metadata: combinators.constant({}),
            addStub: combinators.noop,
            state: {},
            stubs: () => []
        }),
        server = createSMTPServer(result);

    result.close = callback => {
        server.close(combinators.noop);
        callback();
    };

    result.listen = port => {
        const Q = require('q'),
            deferred = Q.defer();

        server.listen(port, () => {
            deferred.resolve(server.server.address().port);
        });
        return deferred.promise;
    };

    return result;
}

/**
 * Initializes the smtp protocol
 * @param {object} logger - the base logger
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object}
 */
function initialize (logger, recordRequests, debug) {
    const implementation = {
        protocolName: 'smtp',
        createServer: createServer,
        Request: require('./smtpRequest')
    };

    return {
        name: implementation.protocolName,
        create: require('../abstractServer').implement(implementation, recordRequests, debug, logger).create,
        testRequest: {
            from: 'test@test.com',
            to: ['test@test.com'],
            subject: 'Test',
            text: 'Test'
        }
    };
}

module.exports = { initialize };
