'use strict';

/**
 * Shared logic for xpath selector
 * @module
 */

function xpathSelect (selectFn, selector, doc) {
    const errors = require('../util/errors'),
        helpers = require('../util/helpers');

    if (!helpers.defined(doc)) {
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
        return String(node.firstChild.data);
    }
    else {
        return String(node.data);
    }
}

/**
 * Returns xpath value(s) from given xml
 * @param {String} selector - The xpath selector
 * @param {Object} ns - The namespace map
 * @param {String} possibleXML - the xml
 * @param {Object} logger - Optional, used to log XML parsing errors
 * @returns {Object}
 */
function select (selector, ns, possibleXML, logger) {
    const xpath = require('xpath'),
        DOMParser = require('xmldom').DOMParser,
        parser = new DOMParser({
            errorHandler: (level, message) => {
                const warn = (logger || {}).warn || (() => {});
                warn('%s (source: %s)', message, JSON.stringify(possibleXML));
            }
        }),
        doc = parser.parseFromString(possibleXML),
        selectFn = xpath.useNamespaces(ns || {}),
        result = xpathSelect(selectFn, selector, doc);
    let nodeValues;

    if (['number', 'boolean'].indexOf(typeof result) >= 0) {
        return result;
    }

    nodeValues = result.map(nodeValue);

    if (nodeValues.length === 0) {
        return undefined;
    }
    else {
        return nodeValues;
    }
}

module.exports = { select };
