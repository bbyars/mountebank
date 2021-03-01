'use strict';

let root = '.';
const path = require('path');

if (process.env.MB_EXECUTABLE) {
    root = path.normalize(`${path.dirname(process.env.MB_EXECUTABLE)}/..`);
}

const protocols = {
        smtp: { createCommand: `node ${root}/src/models/smtp/index.js` },
        http: { createCommand: `node ${root}/src/models/http/index.js` },
        https: { createCommand: `node ${root}/src/models/https/index.js` },
        tcp: { createCommand: `node ${root}/src/models/tcp/index.js` }
    },
    fs = require('fs');

const protocolFile = process.argv[2] || 'protocols.json';
fs.writeFileSync(protocolFile, JSON.stringify(protocols, null, 2));
