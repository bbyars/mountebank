'use strict';
/*global $:false */
/*global document:false */

function setResponse (data) {
    $('#api-response').text(JSON.stringify(data, null, 4));
}

function request (verb, path) {
    $('#api-request').text(verb + ' ' + path);
    $.ajax({
        url: path,
        type: verb,
        success: setResponse
    });
}

$(document).ready(function () {
    $('a').on('click', function () {
        var link = $(this),
            row = link.closest('tr'),
            imposter = row.attr('id').replace('imposter-', ''),
            url = '/imposters/' + imposter,
            action = link.attr('class').replace('-icon', '');

        switch (action) {
            case 'inspect':
                request('GET', url);
                break;
            case 'delete':
                request('DELETE', url);
                row.fadeOut(500, row.remove);
                break;
            case 'add':
                break;
        }
        return false;
    });
});
