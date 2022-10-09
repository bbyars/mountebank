'use strict';

const os = require('os');

function getLocalIPs () {
    const interfaces = os.networkInterfaces(),
        result = [];

    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(ip => {
            if (ip.internal) {
                result.push(ip.address);
                if (ip.family === 'IPv4') {
                    // Prefix for IPv4 address mapped to a compliant IPv6 scheme
                    result.push(`::ffff:${ip.address}`);
                }
            }
        });
    });
    return result;
}

function ipWithoutZoneId (ip) {
    return ip.replace(/%\w+/, '').toLowerCase();
}

function createIPVerification (options) {
    const allowedIPs = getLocalIPs();

    if (!options.localOnly) {
        options.ipWhitelist.forEach(ip => { allowedIPs.push(ip.toLowerCase()); });
    }

    if (allowedIPs.indexOf('*') >= 0) {
        return () => true;
    }
    else {
        return (ip, logger) => {
            if (typeof ip === 'undefined') {
                logger.error('Blocking request because no IP address provided. This is likely a bug in the protocol implementation.');
                return false;
            }
            else {
                const allowed = allowedIPs.some(allowedIP => allowedIP === ipWithoutZoneId(ip));
                if (!allowed) {
                    logger.warn(`Blocking incoming connection from ${ip}. Turn off --localOnly or add to --ipWhitelist to allow`);
                }
                return allowed;
            }
        };
    }
}

module.exports = { createIPVerification };
