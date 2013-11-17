'use strict';

console.log('Current directory: ' + process.cwd());
require('blanket')({
    pattern: '/server/src/'
});
