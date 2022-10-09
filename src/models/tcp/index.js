'use strict';

const config = JSON.parse(process.argv[2]),
    tcpServer = require('./tcpServer.js'),
    tcpProxy = require('./tcpProxy.js'),
    mbConnection = require('../mbConnection.js').create(config);

tcpServer.create(config, mbConnection.logger(), mbConnection.getResponse).then(server => {
    mbConnection.setPort(server.port);
    mbConnection.setProxy(tcpProxy.create(mbConnection.logger(), server.encoding, server.isEndOfRequest));

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}).catch(error => {
    console.error(JSON.stringify(error));
    process.exit(1); // eslint-disable-line no-process-exit
});
