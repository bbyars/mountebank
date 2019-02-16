'use strict';

const config = JSON.parse(process.argv[2]),
    tcpServer = require('./tcpServer'),
    outOfProcessImposter = require('../outOfProcessImposter'),
    logger = outOfProcessImposter.createLogger(config.loglevel),
    Q = require('q');
let encoding = 'utf8',
    callbackURL;

function getProxyResponse (proxyConfig, request, proxyCallbackURL) {
    const proxy = require('./tcpProxy').create(logger, encoding);
    return proxy.to(proxyConfig.to, request, proxyConfig)
        .then(response => outOfProcessImposter.postJSON({ proxyResponse: response }, proxyCallbackURL));
}

function getResponse (request) {
    return outOfProcessImposter.postJSON({ request }, callbackURL).then(mbResponse => {
        if (mbResponse.proxy) {
            return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackURL);
        }
        else {
            return Q(mbResponse.response);
        }
    });
}

tcpServer.create(config, logger, getResponse).done(server => {
    callbackURL = config.callbackURLTemplate.replace(':port', server.port);
    encoding = server.encoding;

    const metadata = {
        port: server.port,
        encoding: server.encoding,
        mode: server.metadata.mode
    };
    console.log(JSON.stringify(metadata));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
