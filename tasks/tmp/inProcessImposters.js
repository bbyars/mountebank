'use strict';

const fs = require('fs');
if (fs.existsSync('protocols.json')) {
    fs.unlinkSync('protocols.json');
}
