'use strict';

const fs = require('fs'),
    version = require('../../package.json').version,
    dir = `docs/mountebank/${version}`,
    execSync = require('child_process').execSync;

if (!fs.existsSync(dir)) {
    console.error('No docs exist; run "npm run jsdoc" first');
    process.exit(1); // eslint-disable-line no-process-exit
}
if (!process.env.FIREBASE_TOKEN) {
    console.error('FIREBASE_TOKEN environment variable must be set');
    process.exit(1); // eslint-disable-line no-process-exit
}

console.log('Deploying docs to firebase...');
fs.copyFileSync('./firebase.json', `${dir}/firebase.json`);
execSync(`../../../node_modules/.bin/firebase deploy --token "${process.env.FIREBASE_TOKEN}" --project firebase-mountebank`,
    { cwd: dir, stdio: 'inherit' });
