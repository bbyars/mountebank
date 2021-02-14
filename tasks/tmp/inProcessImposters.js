'use strict';

const fs = require('fs-extra');
if (fs.existsSync('protocols.json')) {
    fs.unlinkSync('protocols.json');
}
