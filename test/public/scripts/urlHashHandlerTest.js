'use strict';

const assert = require('assert'),
    mock = require('../../mock').mock,
    JSDOM = require('jsdom').JSDOM,
    jquery = require('../../../src/public/scripts/jquery/jquery-3.3.1.min.js');

function initJQuery (htmlDocument) {
    const window = global.window = new JSDOM(htmlDocument).window;
    window.scrollTo = () => {}; // not implemented in jsdom 11.x
    global.document = window.document;
    global.$ = jquery(window);
    return window;
}

describe('url-hash-handler', function () {
    describe('toggleSection', function () {
        it('should add class expanded to the section', function () {
            const htmlDocument = '<div>' +
                '<span id="elementToBeClicked"></span>' +
                '<section id="sectionToBeChecked"></section>' +
                '</div>';
            initJQuery(htmlDocument);
            const toggleSection = require('../../../src/public/scripts/urlHashHandler').toggleExpandedOnSection;
            const $sectionToBeChecked = $('#sectionToBeChecked');

            toggleSection($('#elementToBeClicked'));
            assert.equal($sectionToBeChecked.hasClass('expanded'), true);
        });

        it('should remove class expanded from the section', function () {
            const htmlDocument = '<div>' +
                '<span id="elementToBeClicked"></span>' +
                '<section class="expanded" id="sectionToBeChecked"></section>' +
                '</div>';
            initJQuery(htmlDocument);
            const toggleSection = require('../../../src/public/scripts/urlHashHandler').toggleExpandedOnSection;
            const $sectionToBeChecked = $('#sectionToBeChecked');

            toggleSection($('#elementToBeClicked'));
            assert.equal($sectionToBeChecked.hasClass('expanded'), false);
        });
    });

    describe('hashLocationHandler', function () {
        it('should click on the section from hash', function () {
            const window = initJQuery('<div id="sectionToBeTested"></div>');
            const sectionOnClick = mock();
            $('#sectionToBeTested').on('click', sectionOnClick);
            window.location.hash = 'sectionToBeTested';
            const hashLocationHandler = require('../../../src/public/scripts/urlHashHandler').hashLocationHandler;
            hashLocationHandler(window);
            assert.equal(sectionOnClick.wasCalled(), true);
        });
    });
});
