'use strict';

// Crockford-style prototypical inheritance, which basically allows me to completely
// avoid the new and this operators, which I have an unnatural aversion to

function from (proto, obj) {
    // allow either inherit.from(EventEmitter) or inherit.from({key: 'value'})
    if (typeof proto === 'function') {
        proto = new proto();
    }

    obj = obj || {};
    function F () {}
    F.prototype = proto;
    var result = new F();
    Object.keys(obj).forEach(function (key) {
        result[key] = obj[key];
    });
    return result;
}

module.exports = {
    from: from
};
