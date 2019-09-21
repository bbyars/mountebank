'use strict';

/**
 * Error types returned by the API
 * @module
 */

interface IErrorOptions {
    [key:string]:unknown
}

interface IMontebankError {
    [key:string]:unknown
}

function createError (code:string, message:string, options?:IErrorOptions):{ new ():unknown } {
    const inherit = require('./inherit'),
        result = inherit.from(Error, { code, message });

    if (options) {
        Object.keys(options).forEach(key => {
            result[key] = options[key];
        });
    }
    return result;
}

function create (code:string) {
    return (message:string, options?:IErrorOptions) => createError(code, message, options);
}

function createWithMessage (code:string, message:string) {
    return (options:IErrorOptions) => createError(code, message, options);
}

// Produces a JSON.stringify-able Error object
// (because message is on the prototype, it doesn't show by default)
export function details (error:IMontebankError):IMontebankError {
    const helpers = require('./helpers'),
        prototypeProperties:{[key:string]:unknown} = {};

    ['message', 'name', 'stack'].forEach(key => {
        if (error[key]) {
            prototypeProperties[key] = error[key];
        }
    });
    return helpers.merge(error, prototypeProperties);
}

export const ValidationError = create('bad data');
export const InjectionError = create('invalid injection');
export const ResourceConflictError = create('resource conflict');
export const InsufficientAccessError = createWithMessage('insufficient access', 'Run mb in superuser mode if you want access');
export const InvalidProxyError = create('invalid proxy');
export const MissingResourceError = create('no such resource');
export const InvalidJSONError = createWithMessage('invalid JSON', 'Unable to parse body as JSON');
export const CommunicationError = createWithMessage('communication', 'Error communicating with mountebank');
export const ProtocolError = create('cannot start server');
