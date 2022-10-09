'use strict';
const path = require('path'),
    fs = require('fs-extra'),
    winston = require('winston'),
    scopedLogger = require('./scopedLogger.js');

function initializeLogfile (filename) {
    // Ensure new logfile on startup so the /logs only shows for this process
    const extension = path.extname(filename),
        pattern = new RegExp(`${extension}$`),
        newFilename = filename.replace(pattern, `1${extension}`);

    if (fs.existsSync(filename)) {
        fs.renameSync(filename, newFilename);
    }
}

function logFormat (config) {
    const template = config.replace(/\$/g, '') // prevent injection attacks
        .replace(/%level/g, '${info.level}')
        .replace(/%message/g, '${info.message}')
        .replace(/%timestamp/g, '${info.timestamp}');

    // eslint-disable-next-line no-new-func
    return new Function('info', `return \`${template}\`;`);
}

function createWinstonFormat (format, config) {
    const formatters = [format.timestamp()];
    if (config.colorize) {
        formatters.push(format.colorize());
    }
    if (config.format === 'json') {
        formatters.push(format.json());
    }
    else if (config.format === 'simple') {
        formatters.push(format.simple());
    }
    else {
        formatters.push(format.printf(logFormat(config.format)));
    }
    return format.combine(...formatters);
}

function createLogger (options) {
    if (!options.log) {
        options.log = { level: 'info' };
    }
    if (!options.log.transports) {
        options.log.transports = {
            file: {
                path: 'mb.log',
                format: 'json'
            }
        };
    }

    const winstonLogger = winston.createLogger({ level: options.log.level }),
        logger = scopedLogger.create(winstonLogger, `[mb:${options.port}] `),
        consoleConfig = options.log.transports.console,
        fileConfig = options.log.transports.file;

    if (consoleConfig) {
        winstonLogger.add(new winston.transports.Console({
            format: createWinstonFormat(winston.format, consoleConfig)
        }));
    }
    if (fileConfig) {
        initializeLogfile(fileConfig.path);
        winstonLogger.add(new winston.transports.File({
            filename: fileConfig.path,
            maxsize: '20m',
            maxFiles: 5,
            tailable: true,
            format: createWinstonFormat(winston.format, fileConfig)
        }));
    }

    return logger;
}

module.exports = { createLogger };

