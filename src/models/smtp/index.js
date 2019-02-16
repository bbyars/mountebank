'use strict';

const config = JSON.parse(process.argv[2]),
    smtpServer = require('./smtpServer'),
    outOfProcessImposter = require('../outOfProcessImposter'),
    logger = outOfProcessImposter.createLogger(config.loglevel);
let callbackURL;

function getResponse (request) {
    return outOfProcessImposter.postJSON({ request }, callbackURL);
}

smtpServer.create(config, logger, getResponse).done(server => {
    callbackURL = config.callbackURLTemplate.replace(':port', server.port);
    console.log(JSON.stringify({ port: server.port }));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
