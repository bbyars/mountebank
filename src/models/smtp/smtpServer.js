'use strict';

var smtp = require('simplesmtp'),
    Q = require('q'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    util = require('util'),
    Domain = require('domain'),
    SmtpRequest = require('./smtpRequest');

var create = function (port, options) {
    var name = options.name ? util.format('smtp:%s %s', port, options.name) : 'smtp:' + port,
        logger = ScopedLogger.create(winston, name),
        deferred = Q.defer(),
        requests = [],
        server = smtp.createSimpleServer({ disableDNSValidation: true }, function (request) {
            var clientName = request.remoteAddress,
                domain = Domain.create(),
                errorHandler = function (error) { logger.error(JSON.stringify(error)); };

            logger.info('%s => From: %s To: %s', clientName, request.from, JSON.stringify(request.to));

            domain.on('error', errorHandler);
            domain.run(function () {
                SmtpRequest.createFrom(request).done(function (smtpRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(smtpRequest));
                    requests.push(smtpRequest);
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
