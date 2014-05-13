'use strict';
/*global $:false */
/*global document:false */
/*global window:false */

function setResponse (xhr) {
    var response = 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText + '\n' +
                    xhr.getAllResponseHeaders() + '\n' +
                    xhr.responseText;
    $('#api-response').text(response);
}

function request (verb, path, json) {
    var domain = window.location.href.replace('http://', '').split('/')[0],
        requestText = verb + ' ' + path + '\n' +
                      'Host: ' + domain + '\n' +
                      'Accept: application/json';
    if (json) {
        requestText += '\nContent-Type: application/json\n\n' + json;
    }

    $('#api-request').text(requestText);
    $.ajax({
        url: path,
        type: verb,
        data: json,
        success: function (data, textStatus, xhr) { setResponse(xhr); },
        error: function (xhr) { setResponse(xhr); }
    });
}

$(document).ready(function () {
    $('a').on('click', function () {
        var link = $(this),
            row = link.closest('tr'),
            imposter = (row.attr('id') || '').replace('imposter-', ''),
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
                $('#add-dialog').dialog('open');
                break;
        }
        return false;
    });

    $('#add-dialog').dialog({
        autoOpen: false,
        height: 500,
        width: '60%',
        modal: true,
        buttons: [
            {
                text: 'Create imposter',
                click: function () {
                    var json = { protocol: $('#protocol').val() };
                    if ($('#port').val()) {
                        json.port = $('#port').val();
                    }
                    if ($('#name').val()) {
                        json.name = $('#name').val();
                    }
                    console.log(JSON.stringify(json, null, 4));
                    $(this).dialog('close');
                    request('POST', '/imposters', json);
                }
            }
        ]
    });
});
