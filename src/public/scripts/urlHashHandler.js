'use strict';

var module = module || {};

const toggleExpandedOnSection = element => {
    $(element).siblings('section').toggleClass('expanded');
};

const addSectionClickHandler = () => {
    $('.section-toggler').on('click', event => {
        toggleExpandedOnSection(event.currentTarget);
    });
};

const hashLocationHandler = window => {
    const hashLocation = window.location.hash;
    if (hashLocation) {
        const $section = $(hashLocation);
        if ($section.length > 0) {
            $section.trigger('click');
            $(window).scrollTop($section.parent().offset().top);
        }
    }
};

$(document).ready(addSectionClickHandler);
$(document).ready(() => {
    hashLocationHandler(window);
});

module.exports = { toggleExpandedOnSection, hashLocationHandler };
