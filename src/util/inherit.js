'use strict';

// Crockford-style prototypical inheritance

function from (proto, obj) {
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
