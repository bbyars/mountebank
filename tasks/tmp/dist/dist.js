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
    await run('npm', ['dedupe'], { cwd: `dist/${destination}` });
}

async function packageMountebank () {
    await distPackage('.', 'mountebank', pkg => {
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
    await distPackage('mbTest', 'test', pkg => {
        pkg.dependencies.mountebank = 'file:../mountebank';
        const lockfile = JSON.parse(fs.readFileSync('dist/test/package-lock.json'));
        lockfile.dependencies.mountebank.version = 'file:../mountebank';
        fs.writeFileSync('dist/test/package-lock.json', JSON.stringify(lockfile, null, 2));
    });
}

async function packageTasks () {
    fs.ensureDirSync('dist/ci');
    ['scripts', 'tasks', 'Procfile'].forEach(file => {
        fs.copySync(file, `dist/ci/${file}`);
    });
}

fs.removeSync('dist');
packageMountebank()
    .then(() => packageMbTest())
    .then(() => packageTasks())
    .then(() => console.log('packages available in dist directory'))
    .catch(error => {
        console.error(error);
        process.exit(1); // eslint-disable-line no-process-exit
    });
