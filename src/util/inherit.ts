'use strict';

/** @module */

interface ICtor {
    new ():ICtor;
}

/**
 * Crockford-style prototypical inheritance, which basically allows me to completely
 * avoid the new and this operators, which I have an unnatural aversion to
 * @param {Object} proto - the object to inherit from
 * @param {Object} [obj] - properties to merge into the newly created object as own properties
 * @returns {Object}
 */
export function from (proto:ICtor, obj:ICtor|object|{[key:string]:unknown}) {
    // allow either inherit.from(EventEmitter) or inherit.from({key: 'value'})
    if (typeof proto === 'function') {
        proto = new proto();
    }

    obj = obj || {};
    const ctor = function F () {} as any as { new ():any };
    ctor.prototype = proto;
    const result = new ctor();
    Object.keys(obj).forEach(key => {
        result[key] = (obj as {[key:string]:unknown})[key];
    });
    return result;
}
