'use strict';

const fs = require('fs-extra'),
    yargs = require('yargs'),
    aliases = {
        d: 'debug',
        h: 'host',
        i: 'allowInjection',
        l: 'localOnly',
        m: 'mock',
        p: 'port',
        r: 'removeProxies',
        w: 'ipWhitelist',
        o: 'origin'
    },
    options = {
        rcfile: {
            description: 'the startup file ("run commands") containing configuration options',
            nargs: 1,
            type: 'string',
            global: false
        },
        port: {
            default: 2525,
            description: 'the port to run the mountebank server on',
            nargs: 1,
            type: 'number',
            alias: aliases.p,
            global: false
        },
        host: {
            description: 'the hostname to bind the mountebank server to',
            nargs: 1,
            type: 'string',
            alias: aliases.h,
            global: false
        },
        configfile: {
            description: 'file to load imposters from, can be an EJS template',
            nargs: 1,
            type: 'string',
            global: false
        },
        noParse: {
            default: false,
            description: 'prevent rendering the configfile as an EJS template',
            type: 'boolean',
            global: false
        },
        datadir: {
            description: 'the directory to persist all imposter data',
            nargs: 1,
            type: 'string',
            global: false
        },
        impostersRepository: {
            description: 'path to custom imposters repository',
            nargs: 1,
            type: 'string',
            global: false
        },
        pidfile: {
            default: 'mb.pid',
            description: 'where the pid is stored for the stop command',
            nargs: 1,
            type: 'string',
            global: false
        },
        nologfile: {
            default: false,
            description: 'prevent logging to the filesystem',
            type: 'boolean',
            global: false
        },
        logfile: {
            default: 'mb.log',
            description: 'path to use for logging',
            nargs: 1,
            type: 'string',
            global: false
        },
        loglevel: {
            default: 'info',
            description: 'level for logging',
            nargs: 1,
            type: 'string',
            choices: ['debug', 'info', 'warn', 'error'],
            global: false
        },
        log: {
            description: 'customizable logging configuration',
            nargs: 1,
            type: 'string',
            global: false
        },
        allowInjection: {
            default: false,
            description: 'set to allow JavaScript injection',
            type: 'boolean',
            alias: aliases.i,
            global: false
        },
        localOnly: {
            default: false,
            description: 'allow connections only from localhost',
            type: 'boolean',
            alias: aliases.l,
            global: false
        },
        ipWhitelist: {
            default: '*',
            description: 'pipe-delimited list of allowed IP addresses',
            alias: aliases.w,
            global: false
        },
        mock: {
            default: false,
            description: '[Deprecated] remember requests (use "recordRequests" per imposter instead)',
            type: 'boolean',
            alias: aliases.m,
            global: false
        },
        debug: {
            default: false,
            description: 'include stub match information in imposter retrievals for debugging purposes',
            type: 'boolean',
            alias: aliases.d,
            global: false
        },
        savefile: {
            default: 'mb.json',
            description: 'file to save imposters to',
            nargs: 1,
            type: 'string',
            global: false
        },
        protofile: {
            default: 'protocols.json',
            description: 'file to load custom protocol implementations from',
            nargs: 1,
            type: 'string',
            global: false
        },
        removeProxies: {
            default: false,
            description: 'removes proxies from the configuration when using the save command',
            type: 'boolean',
            alias: aliases.r,
            global: false
        },
        origin: {
            default: false,
            description: 'safe origin for CORS requests',
            type: 'string',
            global: false
        },
        apikey: {
            description: 'An optional API key. When provided, a user must add an API key to the header.',
            default: null,
            type: 'string',
            global: false
        }
    },
    startOptions = {
        port: options.port,
        host: options.host,
        configfile: options.configfile,
        noParse: options.noParse,
        formatter: options.formatter,
        datadir: options.datadir,
        impostersRepository: options.impostersRepository,
        pidfile: options.pidfile,
        nologfile: options.nologfile,
        logfile: options.logfile,
        loglevel: options.loglevel,
        log: options.log,
        allowInjection: options.allowInjection,
        localOnly: options.localOnly,
        ipWhitelist: options.ipWhitelist,
        mock: options.mock,
        debug: options.debug,
        protofile: options.protofile,
        origin: options.origin,
        rcfile: options.rcfile,
        apikey: options.apikey
    },
    argv = yargs
        .usage('Usage: mb [command=start] [options...]')
        .command('start', 'Starts the server (default command)', startYargs => {
            startYargs
                .usage('Usage: mb [start] [options...]')
                .help('help')
                .wrap(null)
                .options(startOptions)
                .example('mb start --port 3000 --allowInjection --loglevel debug',
                    'Starts on port 3000, allowing injections and turning on debug logging')
                .example("mb --ipWhitelist '192.168.1.20|192.158.1.21'",
                    'Starts on port 2525 with the given ip whitelist')
                .epilog('Note on the last example that start is assumed if no command is specified\n\nFor more information, see http://www.mbtest.org/docs/commandLine');
        })
        .command('stop', 'Stops the server', stopYargs => {
            stopYargs
                .usage('Usage: mb stop [--pidfile file.pid]')
                .help('help')
                .wrap(null)
                .options({ pidfile: options.pidfile, rcfile: options.rcfile })
                .example('mb stop', 'Stops the process identified in mb.pid')
                .example('mb stop --pidfile test.pid', 'Stops the process identified in test.pid')
                .epilog('For more information, see http://www.mbtest.org/docs/commandLine');
        })
        .command('restart', "Stops the server if it's running and restarts it", restartYargs => {
            restartYargs
                .usage('Usage: mb restart [options...]')
                .help('help')
                .wrap(null)
                .options(startOptions)
                .example('mb restart --port 3000 --allowInjection --loglevel debug',
                    'Restarts on port 3000, allowing injections and turning on debug logging')
                .example('mb restart --pidfile test.pid', 'Stops the process identified in test.pid and restarts on port 2525')
                .epilog('The port does not have to match the currently running instance, but the pidfile must match\n\nFor more information, see http://www.mbtest.org/docs/commandLine');
        })
        .command('save', 'Saves current imposter configuration to a config file', saveYargs => {
            saveYargs
                .usage('Usage: mb save [options...]\n\nSaves a snapshot of your configuration, including new responses created by proxies')
                .help('help')
                .wrap(null)
                .options({
                    port: options.port,
                    savefile: options.savefile,
                    formatter: options.formatter,
                    removeProxies: options.removeProxies,
                    host: options.host,
                    rcfile: options.rcfile
                })
                .example('mb save --savefile config.json --removeProxies --port 3000',
                    'Saves the config without proxies into config.json by querying port 3000')
                .example('mb save', 'Saves the config as is into mb.json by querying port 2525')
                .epilog('For more information, see http://www.mbtest.org/docs/commandLine');
        })
        .command('replay',
            'Switches from record mode to replay by removing proxies',
            replayYargs => {
                replayYargs
                    .usage('Usage: mb replay [--port 3000]')
                    .help('help')
                    .wrap(null)
                    .options({ port: options.port, host: options.host, rcfile: options.rcfile })
                    .example('mb replay --port 3000',
                        'Resets the configuration of mountebank running on port 3000 to remove all proxies')
                    .example('mb replay', 'Resets the configuration of mountebank running on port 2525 to remove all proxies')
                    .epilog('For more information, see http://www.mbtest.org/docs/commandLine');
            })
        .version()
        .wrap(null)
        .epilog('mb [command] --help provides more details\n\nFor more information, see http://www.mbtest.org/docs/commandLine')
        .argv;

function fixAliases (args) {
    Object.keys(args).forEach(key => {
        if (aliases[key]) {
            args[aliases[key]] = args[key];
            delete args[key];
        }
    });
}

// Unfortunately, while yargs defaults correctly when the command is present, I couldn't
// figure out how to make it default when the command is absent, which I need to default to start.
// You can set what yargs considers to be the default command by .command(['start', '*']), but
// that changes the help docs in ways I don't want.
function fixDefaults (args) {
    if (args._.length === 0) {
        Object.keys(startOptions).forEach(key => {
            if (typeof args[key] === 'undefined') {
                args[key] = startOptions[key].default;
            }
        });
    }
}

function fixIPWhitelist (command, args) {
    if (command === 'start' || command === 'restart') {
        args.ipWhitelist = args.ipWhitelist.split('|');
    }
}

function rawArgvIndexFor (key) {
    // Use raw process.argv to ensure user actually passed the parameter, bypassing
    // yargs defaulting. Also check alias.
    let index = process.argv.indexOf(`--${key}`);
    if (index < 0) {
        const aliasKeys = Object.keys(aliases);
        for (let i = 0; i < aliasKeys.length; i += 1) {
            let alias = aliasKeys[i];
            if (aliases[alias] === key) {
                index = process.argv.indexOf(`-${alias}`);
            }
        }
    }
    return index;
}

function argIsPassedOnCLI (key) {
    return rawArgvIndexFor(key) >= 0;
}

function argvOrDefaultFor (key) {
    const index = rawArgvIndexFor(key);
    if (index >= 0) {
        return process.argv[index + 1];
    }
    else {
        return options[key].default;
    }
}

function parseLogConfiguration (args) {
    // Not defaulted in yargs so we can test yargs value without defaulting interfering.
    // This is needed for backwards compatibility with older CLI options.
    const defaultConfig = {
        level: 'info',
        transports: {
            console: {
                colorize: true,
                format: '%level: %message'
            },
            file: {
                path: 'mb.log',
                format: 'json'
            }
        }
    };

    if (typeof args.log === 'string') {
        try {
            args.log = JSON.parse(args.log);
        }
        catch (ex) {
            console.error(`Cannot parse --log as JSON: ${ex}`);
            args.log = defaultConfig;
        }
    }
    else {
        // Backwards compatibility with older CLI options. Using raw process.argv
        // to ensure user actually passed the parameter, bypassing yargs defaulting
        args.log = defaultConfig;
        args.log.level = argvOrDefaultFor('loglevel');
        args.log.transports.file.path = argvOrDefaultFor('logfile');
        if (argIsPassedOnCLI('nologfile')) {
            delete args.log.transports.file;
        }
    }

    // Remove the old values to not confuse users retrieving configuration later
    delete args.loglevel;
    delete args.logfile;
    delete args.nologfile;
}

// Prevent noise from being logged
function removeNoise (args) {
    delete args._;
    delete args.$0;
    delete args.version;
}

function addStartupFile (args) {
    if (typeof args.rcfile !== 'string' || args.rcfile === '') {
        return;
    }
    if (!fs.existsSync(args.rcfile)) {
        console.error(`Cannot find rcfile ${args.rcfile}`);
        return;
    }
    try {
        const rc = JSON.parse(fs.readFileSync(args.rcfile));

        // CLI options take priority over anything in the rcfile.
        Object.keys(rc).forEach(key => {
            if (!argIsPassedOnCLI(key)) {
                args[key] = rc[key];
            }
        });
    }
    catch (ex) {
        console.error(`Cannot parse rcfile ${args.rcfile}: ${ex}`);
    }
}

function getCommandLineArgs (command, args) {
    fixAliases(args);
    fixDefaults(args);
    fixIPWhitelist(command, args);
    parseLogConfiguration(args);
    removeNoise(args);
    addStartupFile(args);
    return args;
}

function error (message) {
    console.error(`${message}\n`);
    yargs.showHelp();
    process.exit(1); // eslint-disable-line no-process-exit
}

function help () {
    yargs.showHelp();
}

const command = argv._.length === 0 ? 'start' : argv._[0],
    args = getCommandLineArgs(command, argv);

module.exports = { command, args, error, help };
