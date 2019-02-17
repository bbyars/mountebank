'use strict';

const config = JSON.parse(process.argv[2]),
    smtpServer = require('./smtpServer'),
    mbConnection = require('../mbConnection').create(config);

smtpServer.create(config, mbConnection.logger(), mbConnection.getResponse).done(server => {
    mbConnection.setPort(server.port);

    const metadata = server.metadata;
    metadata.port = server.port;
    console.log(JSON.stringify(metadata));
}, error => {
    console.error(JSON.stringify(error));
    process.exit(1);
});
