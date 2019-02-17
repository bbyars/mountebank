'use strict';

const config = JSON.parse(process.argv[2]),
    tcpServer = require('./tcpServer'),
    mbConnection = require('../mbConnection').create(config);

tcpServer.create(config, mbConnection.logger(), mbConnection.getResponse).done(server => {
    mbConnection.setPort(server.port);
    mbConnection.setProxy(require('./tcpProxy').create(mbConnection.logger(), server.encoding));

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
