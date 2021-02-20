'use strict';

const run = require('../../run').run,
    fs = require('fs-extra'),
    thisPackage = require('../../../package.json');

fs.removeSync('dist');
fs.ensureDirSync('dist/mountebank');

thisPackage.files.forEach(source => {
    fs.copySync(source, `dist/mountebank/${source}`);
});
fs.removeSync('dist/src/public/images/sources');

delete thisPackage.devDependencies;
fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(thisPackage, null, 2));
run('npm', ['ci'], { cwd: 'dist/mountebank' });
