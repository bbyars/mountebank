'use strict';

module.exports = function (grunt) {
    var defaultWarnHandler = grunt.fail.warn;

    grunt.registerTask('try', 'Support continuing beyond failure while still capturing failures', function () {
        grunt.option('force', true);
        grunt.fail.warn = function () {
            grunt.config.set('mb:warning-issued', true);
            defaultWarnHandler.apply(grunt, Array.prototype.slice.call(arguments));
        };
    });

    grunt.registerTask('finally', 'Restore grunt to stop on failure', function () {
        grunt.option('force', false);
        grunt.fail.warn = defaultWarnHandler;
    });

    grunt.registerTask('checkForErrors', 'fail build if any steps executed in a try block failed', function () {
        if(grunt.config('mb:warning-issued')) {
            grunt.fail.warn('Failing from previous errors');
        }
    });
};
