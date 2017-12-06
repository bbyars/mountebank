'use strict';

var assert = require('assert'),
    mock = require('../../mock').mock,
    jsdom = require('jsdom');

function initJQuery (htmlDocument) {
    var document = global.document = jsdom.jsdom(htmlDocument),
        window = document.defaultView;
    global.$ = require('../../testHelpers').jquery(window);
    return window;
}

describe('url-hash-handler', function () {
    describe('toggleSection', function () {
        it('should add class expanded to the section', function () {
            var htmlDocument = '<div>' +
                '<span id="elementToBeClicked"></span>' +
                '<section id="sectionToBeChecked"></section>' +
                '</div>';
            initJQuery(htmlDocument);
            var toggleSection = require('../../../src/public/scripts/urlHashHandler').toggleExpandedOnSection;
            var $sectionToBeChecked = $('#sectionToBeChecked');

            toggleSection($('#elementToBeClicked'));
            assert.equal($sectionToBeChecked.hasClass('expanded'), true);
        });

        it('should remove class expanded from the section', function () {
            var htmlDocument = '<div>' +
                '<span id="elementToBeClicked"></span>' +
                '<section class="expanded" id="sectionToBeChecked"></section>' +
                '</div>';
            initJQuery(htmlDocument);
            var toggleSection = require('../../../src/public/scripts/urlHashHandler').toggleExpandedOnSection;
            var $sectionToBeChecked = $('#sectionToBeChecked');

            toggleSection($('#elementToBeClicked'));
            assert.equal($sectionToBeChecked.hasClass('expanded'), false);
        });
    });

    describe('hashLocationHandler', function () {
        it('should click on the section from hash', function () {
            var window = initJQuery('<div id="sectionToBeTested"></div>');
            var sectionOnClick = mock();
            $('#sectionToBeTested').on('click', sectionOnClick);
            window.location.hash = 'sectionToBeTested';
            var hashLocationHandler = require('../../../src/public/scripts/urlHashHandler').hashLocationHandler;
            hashLocationHandler(window);
            assert.equal(sectionOnClick.wasCalled(), true);
        });
    });
});