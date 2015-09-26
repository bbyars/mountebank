'use strict';

var fs = require('fs'),
    Q = require('q'),
    https = require('https'),
    os = require('os'),
    util = require('util'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

function download (url, destination) {
    var deferred = Q.defer(),
        stream = fs.createWriteStream(destination);

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

module.exports = function (grunt) {

    grunt.registerTask('download:zip', 'Download this version of the Windows zip file', function (arch) {
        var zipFile = util.format('mountebank-v%s-win-%s.zip', version, arch || os.arch()),
            versionMajorMinor = version.replace(/\.\d+(\+\d+)?$/, ''),
            url = util.format('https://s3.amazonaws.com/mountebank/v%s/%s', versionMajorMinor, encodeURIComponent(zipFile));

        download(url, 'dist/' + zipFile).done(this.async(), grunt.warn);
    });
};
