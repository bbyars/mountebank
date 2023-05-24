'use strict';

const scan = require('./shared/scan'),
    fs = require('fs'),
    thisPackage = require('../../package.json'),
    dependencies = Object.keys(thisPackage.dependencies).concat(Object.keys(thisPackage.devDependencies)),
    usedCount = {},
    dependencyCheck = file => {
        const contents = fs.readFileSync(file, 'utf8');

        dependencies.forEach(dependency => {
            if (contents.indexOf("require('" + dependency) >= 0 ||
                contents.indexOf("loadNpmTasks('" + dependency + "')") >= 0) {
                usedCount[dependency] += 1;
            }
        });
    },
    exclusions = [
        'node_modules',
        'docs',
        '.git',
        '.DS_Store',
        '.idea',
        'images',
        'dist',
        'mountebank.iml',
        'mb.log',
        '*.pid',
        'package-lock.json',
        '*.csv'
    ],
    whitelist = [
        'coveralls',
        'eslint',
        'eslint-plugin-node',
        'eslint-plugin-mocha',
        'firebase-tools',
        'jsdoc',
        'mocha',
        'mocha-multi-reporters',
        'nc',
        'nyc',
        'snyk',
        'mbTest'
    ],
    errors = [];

dependencies.forEach(dependency => { usedCount[dependency] = 0; });
whitelist.forEach(dependency => { usedCount[dependency] += 1; });

scan.forEachFileIn('.', dependencyCheck, { exclude: exclusions });

dependencies.forEach(dependency => {
    if (usedCount[dependency] === 0) {
        errors.push(dependency + ' is depended on in package.json but is never required');
    }
});

errors.forEach(err => console.error(err));
process.exit(errors.length); // eslint-disable-line no-process-exit
