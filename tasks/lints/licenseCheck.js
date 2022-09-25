'use strict';

const checker = require('license-checker'),
    validLicenses = ['MIT', 'ISC', 'Apache', 'BSD', 'CC0', 'Artistic-2.0', 'CC-BY-3.0', 'Unlicense'];

checker.init({
    start: '.',
    production: true
}, function (err, packages) {
    if (err) {
        console.error(err);
        process.exit(1); // eslint-disable-line no-process-exit
    }
    else {
        const failures = {};
        Object.keys(packages).forEach(name => {
            const supported = validLicenses.some(license => {
                return packages[name].licenses.indexOf(license) >= 0;
            });
            if (!supported) {
                failures[name] = packages[name];
            }
        });
        if (Object.keys(failures).length > 0) {
            console.error('Invalid license(s); either change the dependency or add the license to the valid list: ');
            console.error(JSON.stringify(failures, null, 2));
            process.exit(1); // eslint-disable-line no-process-exit
        }
    }
});
