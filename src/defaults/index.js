'use strict';

const defaults = {
    port: 2525,
    noParse: false,
    formatter: 'mountebank-formatters',
    pidfile: 'mb.pid',
    nologfile: false,
    logfile: 'mb.log',
    loglevel: 'info',
    allowInjection: false,
    localOnly: false,
    ipWhitelist: ['*'],
    mock: false,
    debug: false,
    savefile: 'mb.json',
    protofile: 'protocols.json',
    removeProxies: false,
    origin: false,
    heroku: false
};

function applyDefaults (options) {
    Object.keys(defaults).forEach(key => {
        options[key] = typeof options[key] === 'undefined' ? defaults[key] : options[key];
    });
}

module.exports = { defaults, applyDefaults };
