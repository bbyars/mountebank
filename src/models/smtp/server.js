'use strict';

var smtp = require('simplesmtp'),
    Parser = require('mailparser').MailParser,
    Q = require('q'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    util = require('util'),
    Domain = require('domain');

function simplify (request) {
    var deferred = Q.defer(),
        parser = new Parser();

    request.on('data', function (chunk) { parser.write(chunk); });
    request.once('end', function () { parser.end(); });

    parser.once('end', function (email) {
        /* jshint maxcomplexity: 7 */
        deferred.resolve({
            envelopeFrom: request.from,
            envelopeTo: request.to,
            from: email.from[0],
            to: email.to,
            cc: email.cc || [],
            bcc: email.bcc || [],
            subject: email.subject,
            priority: email.priority,
            references: email.references || [],
            inReplyTo: email.inReplyTo || [],
            text: email.text,
            html: email.html || '',
            attachments: email.attachments || []
        });
    });

    return deferred.promise;
}

var create = function (port, options) {
    var name = options.name ? util.format('smtp:%s %s', port, options.name) : 'smtp:' + port,
        logger = ScopedLogger.create(winston, name),
        deferred = Q.defer(),
        requests = [],
        server = smtp.createSimpleServer({ disableDNSValidation: true }, function (request) {
            var clientName = 'client',//request.socket.remoteAddress + ':' + request.socket.remotePort,
                domain = Domain.create(),
                errorHandler = function (error) { logger.error(JSON.stringify(error)); };

            logger.info('%s => From: %s To: %s', clientName, request.from, JSON.stringify(request.to));

            domain.on('error', errorHandler);
            domain.run(function () {
                simplify(request).done(function (simpleRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                    requests.push(simpleRequest);
                    request.accept();
                }, errorHandler);
            });
        });

    server.listen(port, function () {
        logger.info('Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: function () {},
            metadata: {},
            close: function () { server.server.end(function () { logger.info ('Ciao for now'); }); }
        });
    });

    return deferred.promise;
};

function initialize () {
    return {
        name: 'smtp',
        create: create
    };
}

module.exports = {
    initialize: initialize
};
