'use strict';

const config = JSON.parse(process.argv[2]),
    httpServer = require('./httpServer'),
    outOfProcessImposter = require('../outOfProcessImposter'),
    logger = outOfProcessImposter.createLogger(config.loglevel),
    Q = require('q');
let callbackURL;

function getProxyResponse (proxyConfig, request, proxyCallbackURL) {
    const proxy = require('./httpProxy').create(logger);
    return proxy.to(proxyConfig.to, request, proxyConfig)
        .then(response => outOfProcessImposter.postJSON({ proxyResponse: response }, proxyCallbackURL));
}

function getResponse (request) {
    return outOfProcessImposter.postJSON({ request }, callbackURL).then(mbResponse => {
        console.log(JSON.stringify(mbResponse));
        if (mbResponse.proxy) {
            return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackURL);
        }
        else {
            return Q(mbResponse.response);
        }
    });
}

httpServer.create(config, logger, getResponse).done(server => {
    callbackURL = config.callbackURLTemplate.replace(':port', server.port);

    const metadata = { port: server.port };
    console.log(JSON.stringify(metadata));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
