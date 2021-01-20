'use strict';

const fs = require('fs-extra'),
    https = require('https'),
    os = require('os'),
    version = require('./version').getVersion(),
    versionMajorMinor = version.replace(/\.\d+(-beta\.\d+)?$/, ''),
    urlPrefix = 'https://s3.amazonaws.com/mountebank/v' + versionMajorMinor;

async function download (file, destination) {
    const stream = fs.createWriteStream(destination),
        url = urlPrefix + '/' + encodeURIComponent(file);

    console.log(url + ' => ' + destination);

    return new Promise((resolve, reject) => {
        stream.on('open', function () {
            https.get(url, function (response) {
                response.pipe(stream);
                response.on('error', reject);
            });
        });
        stream.on('finish', function () {
            stream.close(resolve);
        });
        stream.on('error', reject);
    });
}

function bitness () {
    if (os.arch() === 'x64') {
        return 'x64';
    }
    else {
        // avoid "ia32" result on windows
        return 'x86';
    }
}

module.exports = function (grunt) {

    grunt.registerTask('download:zip', 'Download this version of the Windows zip file', async function (arch) {
        const zipFile = `mountebank-v${version}-win-${arch || bitness()}.zip`,
            done = this.async();

        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }

        try {
            await download(zipFile, 'dist/' + zipFile);
            done();
        }
        catch (error) {
            grunt.warn(error);
        }
    });

    grunt.registerTask('download:rpm', 'Download this version of the rpm', async function () {
        const rpmFile = `mountebank-${version.replace('-', '_')}-1.x86_64.rpm`,
            done = this.async();

        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }

        try {
            await download(rpmFile, 'dist/' + rpmFile);
            done();
        }
        catch (error) {
            grunt.warn(error);
        }
    });
};
