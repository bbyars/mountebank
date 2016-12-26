'use strict';

/**
 * Shared logic for xpath selector
 * @module
 */

var xpath = require('xpath'),
    errors = require('../util/errors'),
    DOMParser = require('xmldom').DOMParser;

function xpathSelect (selectFn, selector, doc) {
    if (typeof doc === 'undefined') {
        return [];
    }

    try {
        return selectFn(selector, doc);
    }
    catch (e) {
        throw errors.ValidationError('malformed xpath predicate selector', {
            source: selector,
            inner: e
        });
    }
}

function nodeValue (node) {
    if (node.nodeType === node.TEXT_NODE) {
        return node.nodeValue;
    }
    else if (node.nodeType === node.ATTRIBUTE_NODE) {
        return node.value;
    }
    else if (node.firstChild) {
        // Converting to a string allows exists to return true if the node exists,
        // even if there's no data
        return node.firstChild.data + '';
    }
    else {
        return node.data + '';
    }
}

/**
 * Returns xpath value(s) from given xml
 * @param {String} selector - The xpath selector
 * @param {Object} ns - The namespace map
 * @param {String} possibleXML - the xml
 * @returns {Object}
 */
function select (selector, ns, possibleXML) {
    var doc = new DOMParser().parseFromString(possibleXML),
        selectFn = xpath.useNamespaces(ns || {}),
        result = xpathSelect(selectFn, selector, doc),
        nodeValues;

    if (['number', 'boolean'].indexOf(typeof result) >= 0) {
        return result;
    }

    nodeValues = result.map(nodeValue);

    if (nodeValues.length === 0) {
        return undefined;
    }
    else {
        // array can match in any order
        return nodeValues.sort();
    }
}

module.exports = {
    select: select
};
