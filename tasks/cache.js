'use strict';

var run = require('./run').run;

module.exports = function (grunt) {
    grunt.registerTask('cache', 'Save npm cache', function () {
        run('scripts/cache', []).done(this.async(), function (exitCode) {
            grunt.warn('cache failed', exitCode);
        });
    });
};
