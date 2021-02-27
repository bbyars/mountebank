'use strict';

const run = require('../../run').run,
    fs = require('fs-extra');

async function distPackage (source, destination, packageTransformer) {
    fs.ensureDirSync(`dist/${destination}`);
    const pkg = JSON.parse(fs.readFileSync(`${source}/package.json`));

    pkg.files.forEach(file => {
        fs.copySync(`${source}/${file}`, `dist/${destination}/${file}`);
    });

    packageTransformer(pkg);
    fs.writeFileSync(`dist/${destination}/package.json`, JSON.stringify(pkg, null, 2));

    await run('npm', ['ci'], { cwd: `dist/${destination}` });
    await run('npm', ['prune'], { cwd: `dist/${destination}` });
}

async function packageMountebank () {
    distPackage('.', 'mountebank', pkg => {
        delete pkg.devDependencies;
        Object.keys(pkg.scripts).forEach(script => {
            // We don't package most tasks and don't want users running them anyhow
            if (['start', 'restart', 'stop'].indexOf(script) < 0) {
                delete pkg.scripts[script];
            }
        });
    });
}

async function packageMbTest () {
    distPackage('mbTest', 'test', pkg => {
        pkg.dependencies.mountebank = 'file:../mountebank';
    });
}

async function packageTasks () {
    fs.ensureDirSync('dist/ci');
    ['scripts', 'tasks', 'Gemfile', 'Gemfile.lock', 'Procfile'].forEach(file => {
        fs.copySync(file, `dist/ci/${file}`);
    });
}

fs.removeSync('dist');
packageMountebank()
    .then(() => packageMbTest())
    .then(() => packageTasks())
    .then(() => console.log('packages available in dist directory'));
