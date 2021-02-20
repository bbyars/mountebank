const run = require('../../run').run,
    fs = require('fs-extra'),
    thisPackage = require('../../../package.json'),
    version = thisPackage.version,
    filename = `mountebank-v${version}-npm.tar.gz`;

if (!fs.existsSync('dist/mountebank')) {
    throw new Error('Run "npm run dist" first');
}

run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' })
    .then(() => console.log('tarball created...'));

