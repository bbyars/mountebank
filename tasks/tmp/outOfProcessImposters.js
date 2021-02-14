'use strict';

const protocols = {
        smtp: { createCommand: 'node src/models/smtp/index.js' },
        http: { createCommand: 'node src/models/http/index.js' },
        https: { createCommand: 'node src/models/https/index.js' },
        tcp: { createCommand: 'node src/models/tcp/index.js' }
    },
    fs = require('fs-extra');

fs.writeFileSync('protocols.json', JSON.stringify(protocols, null, 2));
