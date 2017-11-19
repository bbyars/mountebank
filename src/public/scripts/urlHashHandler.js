'use strict';

var module = module || {};

function toggleExpandedOnSection (element) {
    $(element).siblings('section').toggleClass('expanded');
}

function addSectionClickHandler () {
    $('.section-toggler').on('click', function (event) {
        toggleExpandedOnSection(event.currentTarget);
    });
}

function hashLocationHandler (window) {
    var hashLocation = window.location.hash;
    if (hashLocation) {
        var $section = $(hashLocation);
        if ($section.length > 0) {
            $section.trigger('click');
            $(window).scrollTop($section.parent().offset().top);
        }
    }
}

$(document).ready(addSectionClickHandler);
$(document).ready(function () {
    hashLocationHandler(window);
});

module.exports = {
    toggleExpandedOnSection: toggleExpandedOnSection,
    hashLocationHandler: hashLocationHandler
};
