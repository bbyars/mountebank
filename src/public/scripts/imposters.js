'use strict';
/*global $:false */
/*global document:false */

$(document).ready(function () {
    $('a').on('click', function () {
        var link = $(this),
            imposter = link.closest('tr').attr('id').replace('imposter-', ''),
            action = link.attr('class').replace('-icon', '');

        switch (action) {
            case 'inspect':
                var url = '/imposters/' + imposter;
                $('#api-request').text('GET ' + url);
                $.get(url, function (data) {
                    $('#api-response').text(JSON.stringify(data, null, 4));
                });
                break;
            case 'delete':
                break;
            case 'add':
                break;
        }
        return false;
    });
});
