'use strict';

var fs = require('fs-extra'),
    Q = require('q'),
    https = require('https'),
    os = require('os'),
    util = require('util'),
    version = require('./version').getVersion(),
    versionMajorMinor = version.replace(/\.\d+(-beta\.\d+)?$/, ''),
    urlPrefix = 'https://s3.amazonaws.com/mountebank/v' + versionMajorMinor;

function download (file, destination) {
    var deferred = Q.defer(),
        stream = fs.createWriteStream(destination),
        url = urlPrefix + '/' + encodeURIComponent(file);

    console.log(url + ' => ' + destination);
    stream.on('open', function () {
        https.get(url, function (response) {
            response.pipe(stream);
            response.on('error', deferred.reject);
        });
    });
    stream.on('finish', function () {
        stream.close(deferred.resolve);
    });
    stream.on('error', deferred.reject);

    return deferred.promise;
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

    grunt.registerTask('download:zip', 'Download this version of the Windows zip file', function (arch) {
        var zipFile = util.format('mountebank-v%s-win-%s.zip', version, arch || bitness());

        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }
        download(zipFile, 'dist/' + zipFile).done(this.async(), grunt.warn);
    });

    grunt.registerTask('download:rpm', 'Download this version of the rpm', function () {
        var rpmFile = util.format('mountebank-%s-1.x86_64.rpm', version.replace('-', '_'));

        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }
        download(rpmFile, 'dist/' + rpmFile).done(this.async(), grunt.warn);
    });
};
