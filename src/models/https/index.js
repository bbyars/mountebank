'use strict';

const config = JSON.parse(process.argv[2]),
    httpsServer = require('./httpsServer.js'),
    httpProxy = require('../http/httpProxy.js'),
    mbConnection = require('../mbConnection.js').create(config);

httpsServer.create(config, mbConnection.logger(), mbConnection.getResponse).then(server => {
    mbConnection.setPort(server.port);
    mbConnection.setProxy(httpProxy.create(mbConnection.logger()));

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}).catch(error => {
    console.error(JSON.stringify(error));
    process.exit(1); // eslint-disable-line no-process-exit
});
