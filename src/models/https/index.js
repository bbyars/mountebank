'use strict';

const config = JSON.parse(process.argv[2]),
    httpsServer = require('./httpsServer'),
    mbConnection = require('../mbConnection').create(config);

httpsServer.create(config, mbConnection.logger(), mbConnection.getResponse).done(server => {
    mbConnection.setPort(server.port);
    mbConnection.setProxy(require('../http/httpProxy').create(mbConnection.logger()));

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
