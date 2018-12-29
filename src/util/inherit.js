'use strict';

/** @module */

/**
 * Crockford-style prototypical inheritance, which basically allows me to completely
 * avoid the new and this operators, which I have an unnatural aversion to
 * @param {Object} proto - the object to inherit from
 * @param {Object} [obj] - properties to merge into the newly created object as own properties
 * @returns {Object}
 */
function from (proto, obj) {
    // allow either inherit.from(EventEmitter) or inherit.from({key: 'value'})
    if (typeof proto === 'function') {
        proto = new proto();
    }

    obj = obj || {};
    function F () {}
    F.prototype = proto;
    const result = new F();
    Object.keys(obj).forEach(key => {
        result[key] = obj[key];
    });
    return result;
}

module.exports = { from };
