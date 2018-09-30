'use strict';

// Adapted from http://www.blastam.com/blog/index.php/2013/03/how-to-track-downloads-in-google-analytics-v2/

$(document).ready(() => {
    const filetypes = /\.(zip|gz|pkg|rpm|deb)$/i;
    let baseHref = '';

    if ($('base').attr('href') !== undefined) {
        baseHref = $('base').attr('href');
    }

    $('a').on('click', () => {
        /* eslint complexity: 0 */
        try {
            const element = $(this),
                href = element.attr('href'),
                domains = document.domain.split('.').reverse(),
                isThisDomain = href.match(`${domains[1]}.${domains[0]}`),
                events = [];
            let track = false;
            events.value = 0;

            if (href.match(filetypes)) {
                const extension = (/[.]/.exec(href)) ? /[^.]+$/.exec(href) : undefined;
                events.category = 'download';
                events.action = `click-${extension[0]}`;
                events.label = href.replace(/ /g, '-');
                events.nonInteraction = false;
                events.location = baseHref + href;
                track = true;
            }
            else if (href.match(/^https?:/i) && !isThisDomain) {
                events.category = 'external';
                events.action = 'click';
                events.label = href.replace(/^https?:\/\//i, '');
                events.nonInteraction = true;
                events.location = href;
                track = true;
            }

            if (track) {
                /* global _gaq */
                _gaq.push(['_trackEvent', events.category, events.action, events.label, events.value, events.nonInteraction]);
                if (element.attr('target') === undefined || element.attr('target').toLowerCase() !== '_blank') {
                    setTimeout(() => {
                        location.href = events.location;
                    }, 400);
                    return false;
                }
            }
            return true;
        }
        catch (err) {
            console.log(err);
            return true;
        }
    });
});
