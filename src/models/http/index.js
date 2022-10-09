'use strict';

const config = JSON.parse(process.argv[2]),
    httpServer = require('./httpServer.js'),
    httpProxy = require('./httpProxy.js'),
    mbConnection = require('../mbConnection.js').create(config);

httpServer.create(config, mbConnection.logger(), mbConnection.getResponse).then(server => {
    mbConnection.setPort(server.port);
    mbConnection.setProxy(httpProxy.create(mbConnection.logger()));

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}).catch(error => {
    console.error(JSON.stringify(error));
    process.exit(1); // eslint-disable-line no-process-exit
});
