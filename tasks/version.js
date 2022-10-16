'use strict';

const fs = require('fs-extra'),
    thisPackage = JSON.parse(fs.readFileSync('./package.json')),
    buildNumber = process.env.CIRCLE_BUILD_NUM;

if (typeof buildNumber !== 'undefined') {
    thisPackage.version = `${thisPackage.version}-beta.${buildNumber}`;
    fs.writeFileSync('./package.json', JSON.stringify(thisPackage, null, 2) + '\n');
}
