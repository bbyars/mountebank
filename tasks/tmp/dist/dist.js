'use strict';

const run = require('../../run').run,
    fs = require('fs-extra'),
    thisPackage = require('../../../package.json');

fs.removeSync('dist');
fs.ensureDirSync('dist/mountebank');

thisPackage.files.forEach(source => {
    fs.copySync(source, `dist/mountebank/${source}`);
});

delete thisPackage.devDependencies;
Object.keys(thisPackage.scripts).forEach(script => {
    // We don't package most tasks and don't want users running them anyhow
    if (['start', 'restart', 'stop'].indexOf(script) < 0) {
        delete thisPackage.scripts[script];
    }
});
fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(thisPackage, null, 2));
run('npm', ['ci'], { cwd: 'dist/mountebank' });
